import { getJsonRpcProvider } from './provider';
import { HARDHAT_CHAIN_ID } from '../utils/constants';

/**
 * Mine blocks on local Hardhat node
 */
export async function hardhatMineBlocks(count = 1) {
  const provider = getJsonRpcProvider();
  const hexCount = '0x' + count.toString(16);
  try {
    await provider.send('hardhat_mine', [hexCount]);
  } catch {
    // Fallback to loop evm_mine
    for (let i = 0; i < count; i++) {
      await provider.send('evm_mine', []);
    }
  }
  const block = await provider.getBlock('latest');
  return block.number;
}

/**
 * Fast forward timestamp on local Hardhat node
 */
export async function hardhatIncreaseTime(seconds = 86400) {
  const provider = getJsonRpcProvider();
  await provider.send('evm_increaseTime', [seconds]);
  await provider.send('evm_mine', []);
  const block = await provider.getBlock('latest');
  return block.timestamp;
}

/**
 * Get current block number and block timestamp
 */
export async function getBlockDetails() {
  try {
    const provider = getJsonRpcProvider();
    const block = await provider.getBlock('latest');
    return {
      number: block.number,
      timestamp: block.timestamp,
    };
  } catch (err) {
    return { number: 0, timestamp: 0, error: err.message };
  }
}
