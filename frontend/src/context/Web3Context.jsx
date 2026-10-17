import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  getBrowserProvider,
  getJsonRpcProvider,
  checkRpcConnectivity,
  switchToHardhatNetwork,
} from '../services/provider';
import { HARDHAT_CHAIN_ID } from '../utils/constants';
import { useToast } from './ToastContext';
import { parseContractError } from '../utils/errors';

const Web3Context = createContext(null);

export function Web3Provider({ children }) {
  const { addToast } = useToast();
  const [address, setAddress] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [rpcStatus, setRpcStatus] = useState({ online: false, blockNumber: 0 });
  const [ethBalance, setEthBalance] = useState(0n);

  const isCorrectNetwork = chainId === HARDHAT_CHAIN_ID;
  const isConnected = !!address && !!signer;

  // Poll RPC connectivity and latest block
  const verifyRpc = useCallback(async () => {
    const res = await checkRpcConnectivity();
    setRpcStatus(res);
    return res;
  }, []);

  // Fetch ETH balance of current account
  const refreshBalance = useCallback(async (accountAddr) => {
    const target = accountAddr || address;
    if (!target) return;
    try {
      const provider = getBrowserProvider() || getJsonRpcProvider();
      const bal = await provider.getBalance(target);
      setEthBalance(bal);
    } catch {
      // ignore
    }
  }, [address]);

  // Connect to MetaMask
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      addToast({
        title: 'MetaMask Required',
        message: 'No Ethereum wallet detected. Please install MetaMask to interact with the DAO.',
        type: 'error',
      });
      return false;
    }

    setIsConnecting(true);
    try {
      const provider = getBrowserProvider();
      // Request account access
      const accounts = await provider.send('eth_requestAccounts', []);
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts selected in wallet.');
      }

      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);
      setChainId(currentChainId);

      const currentSigner = await provider.getSigner();
      const userAddr = await currentSigner.getAddress();

      setAddress(userAddr);
      setSigner(currentSigner);
      await refreshBalance(userAddr);

      if (currentChainId !== HARDHAT_CHAIN_ID) {
        addToast({
          title: 'Incorrect Network',
          message: `Connected to Chain ID ${currentChainId}. Please switch to Hardhat Local (${HARDHAT_CHAIN_ID}).`,
          type: 'error',
        });
      } else {
        addToast({
          title: 'Wallet Connected',
          message: `Connected to ${userAddr.slice(0, 6)}...${userAddr.slice(-4)}`,
          type: 'success',
        });
      }

      return true;
    } catch (err) {
      const parsed = parseContractError(err);
      addToast({
        title: 'Connection Failed',
        message: parsed,
        type: 'error',
      });
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [addToast, refreshBalance]);

  // Disconnect/reset the application's wallet session
  const disconnectWallet = useCallback(() => {
    setAddress(null);
    setSigner(null);
    setEthBalance(0n);
    addToast({
      title: 'Wallet Disconnected',
      message: 'Your wallet session has been cleared.',
      type: 'info',
    });
  }, [addToast]);

  // Switch network helper
  const switchNetwork = useCallback(async () => {
    try {
      await switchToHardhatNetwork();
      const provider = getBrowserProvider();
      if (provider) {
        const net = await provider.getNetwork();
        setChainId(Number(net.chainId));
      }
      addToast({
        title: 'Network Switched',
        message: 'Switched to Hardhat Local (Chain 31337).',
        type: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Switch Network Failed',
        message: err.message,
        type: 'error',
      });
    }
  }, [addToast]);

  // Handle MetaMask events: accountsChanged, chainChanged
  useEffect(() => {
    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        const provider = getBrowserProvider();
        if (provider) {
          const newSigner = await provider.getSigner();
          setAddress(accounts[0]);
          setSigner(newSigner);
          refreshBalance(accounts[0]);
          addToast({
            title: 'Account Changed',
            message: `Switched account to ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`,
            type: 'info',
          });
        }
      }
    };

    const handleChainChanged = (newChainIdHex) => {
      const newChainId = parseInt(newChainIdHex, 16);
      setChainId(newChainId);
      // Re-initialize provider on chain change
      const provider = getBrowserProvider();
      if (provider && address) {
        provider.getSigner().then((s) => setSigner(s));
      }
    };

    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
    }

    // Initial check if already connected
    const checkExistingConnection = async () => {
      try {
        const provider = getBrowserProvider();
        if (provider) {
          const accounts = await provider.listAccounts();
          if (accounts.length > 0) {
            const net = await provider.getNetwork();
            setChainId(Number(net.chainId));
            const activeSigner = await provider.getSigner();
            const activeAddr = await activeSigner.getAddress();
            setAddress(activeAddr);
            setSigner(activeSigner);
            refreshBalance(activeAddr);
          }
        }
      } catch {
        // ignore on init
      }
    };

    checkExistingConnection();
    verifyRpc();
    const interval = setInterval(verifyRpc, 5000);

    return () => {
      if (window.ethereum?.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
      clearInterval(interval);
    };
  }, [disconnectWallet, refreshBalance, verifyRpc, addToast, address]);

  return (
    <Web3Context.Provider
      value={{
        address,
        signer,
        chainId,
        isCorrectNetwork,
        isConnected,
        isConnecting,
        rpcStatus,
        ethBalance,
        connectWallet,
        disconnectWallet,
        switchNetwork,
        verifyRpc,
        refreshBalance,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return context;
}
