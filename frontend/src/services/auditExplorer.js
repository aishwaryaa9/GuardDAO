import { ethers } from 'ethers';
import { CONTRACT_ABIS, HARDHAT_NETWORK, getContractAddresses } from '../config/contracts';
import { getJsonRpcProvider } from './provider';
import { getMilestoneEscrowContract, getTreasuryContract } from './contracts';

export const MAX_AUDIT_BLOCK_RANGE = 100_000;
export const AUDIT_BLOCK_CHUNK_SIZE = 2_000;
export const AUDIT_PAGE_SIZE = 50;

const SOURCES = [
  {
    name: 'DAOGovernor',
    abi: CONTRACT_ABIS.DAOGovernor,
    events: [
      'ProposalCreated',
      'VoteCast',
      'ProposalQueued',
      'ProposalExecuted',
      'ProposalCanceled',
      'AllowedCallUpdated',
      'VotingDelaySet',
      'VotingPeriodSet',
      'ProposalThresholdSet',
      'QuorumNumeratorUpdated',
      'TimelockChange',
    ],
  },
  {
    name: 'DAOTimelock',
    abi: CONTRACT_ABIS.DAOTimelock,
    events: ['CallScheduled', 'CallExecuted', 'CallSalt', 'Cancelled', 'MinDelayChange', 'RoleGranted', 'RoleRevoked'],
  },
  {
    name: 'Treasury',
    abi: CONTRACT_ABIS.Treasury,
    events: ['EthDisbursed', 'TokenDisbursed', 'AssetPolicyUpdated', 'RecipientPolicyUpdated', 'OwnershipTransferred'],
  },
  {
    name: 'MilestoneEscrow',
    abi: CONTRACT_ABIS.MilestoneEscrow,
    events: [
      'EscrowFunded',
      'PlanCreated',
      'MilestoneSubmitted',
      'MilestoneApproved',
      'MilestoneRejected',
      'MilestoneReleased',
      'MilestoneRefunded',
      'PlanCancelled',
    ],
  },
  {
    name: 'DAOReputation',
    abi: CONTRACT_ABIS.DAOReputation,
    events: ['ReputationAwarded', 'ReputationRevoked', 'RoleGranted', 'RoleRevoked'],
  },
  {
    name: 'GovernanceToken',
    abi: CONTRACT_ABIS.GovernanceToken,
    events: ['Transfer', 'DelegateChanged', 'DelegateVotesChanged'],
  },
];

export class WrongAuditNetworkError extends Error {
  constructor(actualChainId) {
    super(`Audit Explorer requires chain ${HARDHAT_NETWORK.chainId}; RPC reported chain ${actualChainId}.`);
    this.name = 'WrongAuditNetworkError';
    this.actualChainId = actualChainId;
  }
}

export async function verifyAuditNetwork(provider = getJsonRpcProvider()) {
  const chainIdHex = await provider.send('eth_chainId', []);
  const chainId = Number(BigInt(chainIdHex));
  if (chainId !== HARDHAT_NETWORK.chainId) throw new WrongAuditNetworkError(chainId);
  return chainId;
}

function normalizeValue(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === 'object') {
    if (typeof value.toString === 'function' && value.constructor?.name !== 'Object') {
      return value.toString();
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(item)]));
  }
  return value;
}

function parseEvent(source, iface, log, chainId) {
  const parsed = iface.parseLog(log);
  if (!parsed) throw new Error(`Could not decode a ${source.name} log.`);
  const args = Object.fromEntries(
    parsed.fragment.inputs.map((input, index) => [input.name || `arg${index}`, normalizeValue(parsed.args[index])])
  );
  const logIndex = Number(log.index ?? log.logIndex);
  return {
    id: `${log.transactionHash}:${logIndex}`,
    chainId,
    eventType: parsed.name,
    contractName: source.name,
    contractAddress: log.address,
    txHash: log.transactionHash,
    blockNumber: Number(log.blockNumber),
    blockHash: log.blockHash || null,
    transactionIndex: Number(log.transactionIndex ?? 0),
    logIndex,
    timestamp: null,
    args,
  };
}

function asBlockNumber(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative safe integer block number.`);
  }
  return number;
}

function makeChunks(fromBlock, toBlock, chunkSize) {
  const chunks = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    chunks.push([start, Math.min(toBlock, start + chunkSize - 1)]);
  }
  return chunks;
}

async function attachBlockTimestamps(records, provider) {
  const blockNumbers = [...new Set(records.map((record) => record.blockNumber))];
  const blockTimes = new Map();
  const failures = [];
  const concurrency = 12;
  for (let offset = 0; offset < blockNumbers.length; offset += concurrency) {
    const batch = blockNumbers.slice(offset, offset + concurrency);
    const results = await Promise.all(batch.map(async (blockNumber) => {
      try {
        const block = await provider.getBlock(blockNumber);
        return { blockNumber, timestamp: block ? Number(block.timestamp) : null };
      } catch (error) {
        return { blockNumber, error: error.message || 'Block lookup failed.' };
      }
    }));
    for (const result of results) {
      if (result.error || result.timestamp === null) failures.push(result.blockNumber);
      else blockTimes.set(result.blockNumber, result.timestamp);
    }
  }
  records.forEach((record) => {
    record.timestamp = blockTimes.get(record.blockNumber) ?? null;
  });
  return failures;
}

export async function scanAuditEvents({
  provider = getJsonRpcProvider(),
  addresses = getContractAddresses(),
  fromBlock,
  toBlock,
  chunkSize = AUDIT_BLOCK_CHUNK_SIZE,
  maxBlockRange = MAX_AUDIT_BLOCK_RANGE,
} = {}) {
  const chainId = await verifyAuditNetwork(provider);
  const headBlock = await provider.getBlockNumber();
  const lastBlock = toBlock === undefined ? headBlock : asBlockNumber(toBlock, 'End block');
  if (lastBlock > headBlock) throw new Error(`End block ${lastBlock} is ahead of the current block ${headBlock}.`);
  const firstBlock = fromBlock === undefined
    ? Math.max(0, lastBlock - maxBlockRange + 1)
    : asBlockNumber(fromBlock, 'Start block');
  if (firstBlock > lastBlock) throw new Error('Start block must not be greater than end block.');
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > AUDIT_BLOCK_CHUNK_SIZE) {
    throw new Error(`Audit query chunks must be between 1 and ${AUDIT_BLOCK_CHUNK_SIZE} blocks.`);
  }
  if (lastBlock - firstBlock + 1 > maxBlockRange) {
    throw new Error(`Choose a block range of ${maxBlockRange} blocks or less.`);
  }

  const coverage = {
    chainId,
    fromBlock: firstBlock,
    toBlock: lastBlock,
    headBlock,
    complete: true,
    failures: [],
    decodeFailures: 0,
    timestampFailures: [],
  };
  const byId = new Map();
  const chunks = makeChunks(firstBlock, lastBlock, chunkSize);
  const sourceStates = SOURCES.map((source) => ({ source, failed: false }));

  for (const [chunkFrom, chunkTo] of chunks) {
    await Promise.all(sourceStates.map(async ({ source, failed }, stateIndex) => {
      if (failed) return;
      const address = addresses[source.name];
      if (!address || !ethers.isAddress(address)) {
        sourceStates[stateIndex].failed = true;
        coverage.complete = false;
        coverage.failures.push({
          contract: source.name,
          fromBlock: chunkFrom,
          toBlock: lastBlock,
          message: `No valid configured address for ${source.name}.`,
        });
        return;
      }
      const iface = new ethers.Interface(source.abi);
      const topics = source.events.map((eventName) => iface.getEvent(eventName).topicHash);
      let logs;
      try {
        logs = await provider.getLogs({
          address,
          topics: [topics],
          fromBlock: chunkFrom,
          toBlock: chunkTo,
        });
      } catch (error) {
        sourceStates[stateIndex].failed = true;
        coverage.complete = false;
        coverage.failures.push({
          contract: source.name,
          fromBlock: chunkFrom,
          toBlock: lastBlock,
          message: error.message || 'RPC log query failed.',
        });
        return;
      }
      for (const log of logs) {
        const logIndex = Number(log.index ?? log.logIndex);
        const id = `${log.transactionHash}:${logIndex}`;
        if (byId.has(id)) continue;
        try {
          byId.set(id, parseEvent(source, iface, log, chainId));
        } catch {
          coverage.complete = false;
          coverage.decodeFailures += 1;
        }
      }
    }));
  }

  const records = [...byId.values()];
  coverage.timestampFailures = await attachBlockTimestamps(records, provider);
  if (coverage.timestampFailures.length > 0) coverage.complete = false;

  const proposalIdsByTransaction = new Map();
  records.filter((record) => record.eventType === 'ProposalExecuted').forEach((record) => {
    const proposalIds = proposalIdsByTransaction.get(record.txHash) || [];
    proposalIds.push(record.args.proposalId);
    proposalIdsByTransaction.set(record.txHash, proposalIds);
  });
  records.forEach((record) => {
    const relatedProposals = proposalIdsByTransaction.get(record.txHash);
    if (relatedProposals?.length && record.eventType !== 'ProposalExecuted') {
      record.relatedProposalIds = [...new Set(relatedProposals)];
    }
    if (record.args.planId) record.relatedPlanId = record.args.planId;
  });

  records.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
  return { chainId, records, coverage };
}

export async function loadCurrentAuditBalances(provider = getJsonRpcProvider()) {
  await verifyAuditNetwork(provider);
  const [treasuryBalance, unallocatedFunding] = await Promise.all([
    getTreasuryContract(provider).ethBalance(),
    getMilestoneEscrowContract(provider).unallocatedFunding(),
  ]);
  return { treasuryBalance, unallocatedFunding };
}

export function filterAuditRecords(records, {
  eventType = '',
  search = '',
  identifier = '',
  fromBlock = '',
  toBlock = '',
} = {}) {
  const normalizedSearch = search.trim().toLowerCase();
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const minimumBlock = fromBlock === '' ? null : Number(fromBlock);
  const maximumBlock = toBlock === '' ? null : Number(toBlock);
  return records.filter((record) => {
    if (eventType && record.eventType !== eventType) return false;
    if (normalizedSearch && !record.txHash.toLowerCase().includes(normalizedSearch)) return false;
    if (minimumBlock !== null && record.blockNumber < minimumBlock) return false;
    if (maximumBlock !== null && record.blockNumber > maximumBlock) return false;
    if (normalizedIdentifier) {
      const searchable = [
        record.relatedPlanId,
        ...(record.relatedProposalIds || []),
        record.args.planId,
        record.args.proposalId,
        record.args.contributionId,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!searchable.includes(normalizedIdentifier)) return false;
    }
    return true;
  });
}

export function paginateRecords(records, page, pageSize = AUDIT_PAGE_SIZE) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(records.length / safePageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page)), pageCount);
  const start = (safePage - 1) * safePageSize;
  return {
    page: safePage,
    pageCount,
    pageRecords: records.slice(start, start + safePageSize),
  };
}

function csvValue(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function createAuditCsv(records, chainId, exportedAt = new Date()) {
  const headings = [
    'exported_at',
    'chain_id',
    'block_number',
    'block_timestamp',
    'event_type',
    'contract_name',
    'contract_address',
    'transaction_hash',
    'log_index',
    'sender',
    'recipient',
    'asset',
    'amount_raw',
    'proposal_id',
    'plan_id',
    'event_arguments_json',
  ];
  const rows = records.map((record) => {
    const args = record.args || {};
    return [
      exportedAt.toISOString(),
      chainId,
      record.blockNumber,
      record.timestamp === null ? '' : new Date(record.timestamp * 1000).toISOString(),
      record.eventType,
      record.contractName,
      record.contractAddress,
      record.txHash,
      record.logIndex,
      args.sender || args.voter || args.proposer || args.reviewer || args.awarder || args.revoker || '',
      args.to || args.recipient || args.target || '',
      args.token || (record.eventType === 'EthDisbursed' || record.eventType === 'MilestoneReleased'
        || record.eventType === 'MilestoneRefunded' ? 'ETH' : ''),
      args.amount ?? '',
      record.relatedProposalIds?.join(';') || args.proposalId || '',
      record.relatedPlanId || args.planId || '',
      JSON.stringify(args),
    ];
  });
  return [headings, ...rows].map((row) => row.map(csvValue).join(',')).join('\r\n');
}

export async function getTransactionDetails(provider, record) {
  const [receipt, block] = await Promise.all([
    provider.getTransactionReceipt(record.txHash),
    provider.getBlock(record.blockNumber),
  ]);
  return {
    status: receipt
      ? (Number(receipt.status) === 1 ? 'confirmed' : 'failed')
      : 'receipt-unavailable',
    from: receipt?.from || null,
    to: receipt?.to || null,
    transactionHash: receipt?.hash || record.txHash,
    blockNumber: block?.number ?? record.blockNumber,
    blockHash: block?.hash || record.blockHash,
    timestamp: block?.timestamp === undefined ? record.timestamp : Number(block.timestamp),
    gasUsed: receipt?.gasUsed?.toString() || null,
  };
}
