import DAOGovernorAbi from './abis/DAOGovernor.json';
import DAOTimelockAbi from './abis/DAOTimelock.json';
import GovernanceTokenAbi from './abis/GovernanceToken.json';
import TreasuryAbi from './abis/Treasury.json';
import MilestoneEscrowAbi from './abis/MilestoneEscrow.json';
import DAOReputationAbi from './abis/DAOReputation.json';
import deployment from './deployment.json';

/**
 * Verified addresses from the local Hardhat deployment (chain 31337).
 * Centralized here to avoid scattering addresses across the codebase.
 */
export const DEFAULT_CONTRACT_ADDRESSES = deployment.contracts;

export const CONTRACT_ABIS = {
  DAOGovernor: DAOGovernorAbi,
  DAOTimelock: DAOTimelockAbi,
  GovernanceToken: GovernanceTokenAbi,
  Treasury: TreasuryAbi,
  MilestoneEscrow: MilestoneEscrowAbi,
  DAOReputation: DAOReputationAbi,
};

export const HARDHAT_NETWORK = {
  chainId: 31337,
  chainIdHex: '0x7a69',
  name: 'Hardhat Local',
  rpcUrl: 'http://127.0.0.1:8545',
  currency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
};

const STORAGE_KEY = 'dao_toolkit_contract_addresses';

/**
 * Get active contract addresses with localStorage override support
 */
export function getContractAddresses() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_CONTRACT_ADDRESSES, ...parsed };
    }
  } catch {
    // ignore json errors
  }
  return DEFAULT_CONTRACT_ADDRESSES;
}

/**
 * Save new contract addresses if local deployment was regenerated
 */
export function setContractAddresses(addresses) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
  } catch (err) {
    console.error('Failed to save contract addresses:', err);
  }
}

/**
 * Reset contract addresses back to factory defaults
 */
export function resetContractAddresses() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to reset contract addresses:', err);
  }
}
