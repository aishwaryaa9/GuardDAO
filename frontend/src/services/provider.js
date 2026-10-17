import { ethers } from 'ethers';
import { HARDHAT_NETWORK } from '../config/contracts';

let cachedReadOnlyProvider = null;

/**
 * Returns a read-only JsonRpcProvider for the local Hardhat node.
 */
export function getJsonRpcProvider() {
  if (!cachedReadOnlyProvider) {
    cachedReadOnlyProvider = new ethers.JsonRpcProvider(
      HARDHAT_NETWORK.rpcUrl,
      {
        chainId: HARDHAT_NETWORK.chainId,
        name: HARDHAT_NETWORK.name,
      },
      { staticNetwork: true }
    );
  }
  return cachedReadOnlyProvider;
}

/**
 * Returns a BrowserProvider connected to window.ethereum if available.
 */
export function getBrowserProvider() {
  if (typeof window !== 'undefined' && window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  return null;
}

/**
 * Check if the local Hardhat RPC is online and responding.
 */
export async function checkRpcConnectivity() {
  try {
    const provider = getJsonRpcProvider();
    const blockNumber = await provider.getBlockNumber();
    return { online: true, blockNumber };
  } catch (err) {
    return { online: false, error: err.message };
  }
}

/**
 * Switch or add the Hardhat Local network in MetaMask.
 */
export async function switchToHardhatNetwork() {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed.');
  }

  try {
    // Attempt switch
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: HARDHAT_NETWORK.chainIdHex }],
    });
    return true;
  } catch (switchError) {
    // 4902 error code indicates that the chain has not been added to MetaMask
    if (switchError.code === 4902 || switchError.message?.includes('Unrecognized chain ID')) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: HARDHAT_NETWORK.chainIdHex,
              chainName: HARDHAT_NETWORK.name,
              rpcUrls: [HARDHAT_NETWORK.rpcUrl],
              nativeCurrency: HARDHAT_NETWORK.currency,
            },
          ],
        });
        return true;
      } catch (addError) {
        throw new Error(`Failed to add Hardhat network: ${addError.message}`);
      }
    }
    throw switchError;
  }
}
