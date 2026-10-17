import { ethers } from 'ethers';
import { getContractAddresses, CONTRACT_ABIS } from '../config/contracts';
import { getJsonRpcProvider, getBrowserProvider } from './provider';

/**
 * Get read-only or signer-connected Governor contract instance.
 */
export function getGovernorContract(signerOrProvider = null) {
  const addresses = getContractAddresses();
  const runner = signerOrProvider || getJsonRpcProvider();
  return new ethers.Contract(addresses.DAOGovernor, CONTRACT_ABIS.DAOGovernor, runner);
}

/**
 * Get Timelock contract instance.
 */
export function getTimelockContract(signerOrProvider = null) {
  const addresses = getContractAddresses();
  const runner = signerOrProvider || getJsonRpcProvider();
  return new ethers.Contract(addresses.DAOTimelock, CONTRACT_ABIS.DAOTimelock, runner);
}

/**
 * Get GovernanceToken contract instance.
 */
export function getTokenContract(signerOrProvider = null) {
  const addresses = getContractAddresses();
  const runner = signerOrProvider || getJsonRpcProvider();
  return new ethers.Contract(addresses.GovernanceToken, CONTRACT_ABIS.GovernanceToken, runner);
}

/**
 * Get Treasury contract instance.
 */
export function getTreasuryContract(signerOrProvider = null) {
  const addresses = getContractAddresses();
  const runner = signerOrProvider || getJsonRpcProvider();
  return new ethers.Contract(addresses.Treasury, CONTRACT_ABIS.Treasury, runner);
}

export function getMilestoneEscrowContract(signerOrProvider = null) {
  const addresses = getContractAddresses();
  const runner = signerOrProvider || getJsonRpcProvider();
  if (!addresses.MilestoneEscrow || !ethers.isAddress(addresses.MilestoneEscrow)) {
    throw new Error('MilestoneEscrow is not deployed on the configured local chain.');
  }
  return new ethers.Contract(
    addresses.MilestoneEscrow,
    CONTRACT_ABIS.MilestoneEscrow,
    runner
  );
}

export function getReputationContract(signerOrProvider = null) {
  const addresses = getContractAddresses();
  const runner = signerOrProvider || getJsonRpcProvider();
  if (!addresses.DAOReputation || !ethers.isAddress(addresses.DAOReputation)) {
    throw new Error('DAOReputation is not deployed on the configured local chain.');
  }
  return new ethers.Contract(
    addresses.DAOReputation,
    CONTRACT_ABIS.DAOReputation,
    runner
  );
}

/**
 * Load high-level DAO and token parameters
 */
export async function loadDaoOverview(userAddress = null) {
  const addresses = getContractAddresses();
  const provider = getJsonRpcProvider();
  const token = getTokenContract(provider);
  const governor = getGovernorContract(provider);
  const timelock = getTimelockContract(provider);
  const treasury = getTreasuryContract(provider);

  // Parallel fetch for basic parameters
  const [
    tokenName,
    tokenSymbol,
    totalSupply,
    govName,
    votingDelay,
    votingPeriod,
    proposalThreshold,
    quorumNumerator,
    quorumDenominator,
    timelockMinDelay,
    treasuryEthBalance,
    treasuryGovBalance,
    treasuryOwner,
  ] = await Promise.all([
    token.name().catch(() => 'Governance Token'),
    token.symbol().catch(() => 'GOV'),
    token.totalSupply().catch(() => 0n),
    governor.name().catch(() => 'DAOGovernor'),
    governor.votingDelay().catch(() => 1n),
    governor.votingPeriod().catch(() => 50400n),
    governor.proposalThreshold().catch(() => 1000000000000000000n),
    governor.quorumNumerator().catch(() => 4n),
    governor.quorumDenominator().catch(() => 100n),
    timelock.getMinDelay().catch(() => 86400n),
    treasury.ethBalance().catch(() => 0n),
    treasury.tokenBalance(addresses.GovernanceToken).catch(() => 0n),
    treasury.owner().catch(() => addresses.DAOTimelock),
  ]);

  let userBalance = 0n;
  let userVotingPower = 0n;
  let userDelegate = ethers.ZeroAddress;

  if (userAddress) {
    [userBalance, userVotingPower, userDelegate] = await Promise.all([
      token.balanceOf(userAddress).catch(() => 0n),
      token.getVotes(userAddress).catch(() => 0n),
      token.delegates(userAddress).catch(() => ethers.ZeroAddress),
    ]);
  }

  return {
    addresses,
    token: {
      name: tokenName,
      symbol: tokenSymbol,
      totalSupply,
      userBalance,
      userVotingPower,
      userDelegate,
    },
    governor: {
      name: govName,
      votingDelay,
      votingPeriod,
      proposalThreshold,
      quorumNumerator,
      quorumDenominator,
    },
    timelock: {
      minDelay: timelockMinDelay,
    },
    treasury: {
      ethBalance: treasuryEthBalance,
      govBalance: treasuryGovBalance,
      owner: treasuryOwner,
    },
  };
}

/**
 * Execute token self-delegation or delegation to target address.
 */
export async function delegateTokens(signer, delegateeAddress) {
  if (!signer) throw new Error('Wallet not connected.');
  const token = getTokenContract(signer);
  const tx = await token.delegate(delegateeAddress);
  const receipt = await tx.wait();
  return receipt;
}

/**
 * Transfer GOV tokens to another recipient
 */
export async function transferTokens(signer, toAddress, amountWei) {
  if (!signer) throw new Error('Wallet not connected.');
  const token = getTokenContract(signer);
  const tx = await token.transfer(toAddress, amountWei);
  const receipt = await tx.wait();
  return receipt;
}

/**
 * Submit a new governance proposal
 */
export async function submitProposal(signer, targets, values, calldatas, description) {
  if (!signer) throw new Error('Wallet not connected.');
  const governor = getGovernorContract(signer);
  const tx = await governor.propose(targets, values, calldatas, description);
  const receipt = await tx.wait();

  // Compute expected proposalId via governor.hashProposal
  const descriptionHash = ethers.id(description);
  const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);

  return { receipt, proposalId: proposalId.toString() };
}

/**
 * Cast a vote on a proposal (For = 1, Against = 0, Abstain = 2)
 */
export async function castProposalVote(signer, proposalId, support, reason = '') {
  if (!signer) throw new Error('Wallet not connected.');
  const governor = getGovernorContract(signer);
  let tx;
  if (reason && reason.trim().length > 0) {
    tx = await governor.castVoteWithReason(proposalId, support, reason.trim());
  } else {
    tx = await governor.castVote(proposalId, support);
  }
  const receipt = await tx.wait();
  return receipt;
}

/**
 * Queue a succeeded proposal into the Timelock
 */
export async function queueProposal(signer, targets, values, calldatas, description) {
  if (!signer) throw new Error('Wallet not connected.');
  const governor = getGovernorContract(signer);
  const descriptionHash = ethers.id(description);
  const tx = await governor.queue(targets, values, calldatas, descriptionHash);
  const receipt = await tx.wait();
  return receipt;
}

/**
 * Execute a queued proposal through the Timelock
 */
export async function executeProposal(signer, targets, values, calldatas, description) {
  if (!signer) throw new Error('Wallet not connected.');
  const governor = getGovernorContract(signer);
  const descriptionHash = ethers.id(description);
  const tx = await governor.execute(targets, values, calldatas, descriptionHash);
  const receipt = await tx.wait();
  return receipt;
}

/**
 * Deposit ETH directly into the Treasury contract
 */
export async function depositEthToTreasury(signer, amountWei) {
  if (!signer) throw new Error('Wallet not connected.');
  const addresses = getContractAddresses();
  const tx = await signer.sendTransaction({
    to: addresses.Treasury,
    value: amountWei,
  });
  const receipt = await tx.wait();
  return receipt;
}
