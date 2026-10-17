import { ethers } from 'ethers';
import { getGovernorContract, getTreasuryContract } from './contracts';
import { getJsonRpcProvider } from './provider';
import { getContractAddresses } from '../config/contracts';
import { ProposalState } from '../utils/constants';

const CACHED_PROPOSALS_KEY = 'dao_toolkit_known_proposals';

/**
 * Get known proposals from localStorage cache
 */
export function getLocalProposals() {
  try {
    const raw = localStorage.getItem(CACHED_PROPOSALS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save newly created proposal to localStorage cache
 */
export function cacheProposalLocally(proposal) {
  try {
    const existing = getLocalProposals();
    const idStr = proposal.proposalId.toString();
    const filtered = existing.filter((p) => p.proposalId.toString() !== idStr);
    filtered.unshift({
      ...proposal,
      proposalId: idStr,
      values: proposal.values ? proposal.values.map((v) => v.toString()) : ['0'],
    });
    localStorage.setItem(CACHED_PROPOSALS_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to cache proposal locally:', err);
  }
}

/**
 * Decode treasury calldata if the target is Treasury
 */
export function decodeProposalAction(target, value, calldata, treasuryAddress, treasuryInterface) {
  const isTreasury = target.toLowerCase() === treasuryAddress.toLowerCase();
  if (!isTreasury) {
    return {
      type: 'CUSTOM',
      target,
      value: value.toString(),
      calldata,
      summary: `Call contract at ${target}`,
    };
  }

  try {
    const parsed = treasuryInterface.parseTransaction({ data: calldata, value });
    if (parsed.name === 'disburseEth') {
      const [to, amount, reason] = parsed.args;
      return {
        type: 'TREASURY_ETH',
        target,
        recipient: to,
        amount: amount.toString(),
        reason,
        summary: `Disburse ${ethers.formatEther(amount)} ETH to ${to} (${reason})`,
      };
    }
    if (parsed.name === 'disburseToken') {
      const [token, to, amount, reason] = parsed.args;
      return {
        type: 'TREASURY_TOKEN',
        target,
        token,
        recipient: to,
        amount: amount.toString(),
        reason,
        summary: `Disburse ${ethers.formatEther(amount)} Tokens to ${to} (${reason})`,
      };
    }
  } catch (err) {
    // Calldata parse error fallback
  }

  return {
    type: 'TREASURY_CUSTOM',
    target,
    value: value.toString(),
    calldata,
    summary: `Treasury call`,
  };
}

/**
 * Query Governor events and build full proposal state
 */
export async function fetchAllProposals(userAddress = null) {
  const provider = getJsonRpcProvider();
  const governor = getGovernorContract(provider);
  const treasury = getTreasuryContract(provider);
  const addresses = getContractAddresses();
  const localCache = getLocalProposals();

  const proposalMap = new Map();

  // Seed with local cache
  localCache.forEach((p) => {
    proposalMap.set(p.proposalId.toString(), {
      proposalId: p.proposalId.toString(),
      proposer: p.proposer,
      targets: p.targets || [],
      values: (p.values || []).map((v) => BigInt(v)),
      calldatas: p.calldatas || [],
      description: p.description || '',
      voteStart: p.voteStart ? BigInt(p.voteStart) : 0n,
      voteEnd: p.voteEnd ? BigInt(p.voteEnd) : 0n,
      title: extractProposalTitle(p.description),
    });
  });

  // Query ProposalCreated events from the chain
  try {
    const filter = governor.filters.ProposalCreated();
    // Query last 100,000 blocks or from genesis block 0
    const events = await governor.queryFilter(filter, 0, 'latest');

    for (const ev of events) {
      if (!ev.args) continue;
      const [proposalId, proposer, targets, values, , calldatas, voteStart, voteEnd, description] =
        ev.args;
      const idStr = proposalId.toString();

      proposalMap.set(idStr, {
        proposalId: idStr,
        proposer,
        targets: Array.from(targets),
        values: Array.from(values),
        calldatas: Array.from(calldatas),
        description,
        voteStart,
        voteEnd,
        title: extractProposalTitle(description),
        blockNumber: ev.blockNumber,
        transactionHash: ev.transactionHash,
      });
    }
  } catch (filterErr) {
    console.warn('Could not query ProposalCreated events via filter:', filterErr.message);
  }

  // Now enrich each discovered proposal with live on-chain status
  const currentBlock = await provider.getBlockNumber().catch(() => 0);
  const proposalsArray = Array.from(proposalMap.values());

  const enrichedProposals = await Promise.all(
    proposalsArray.map(async (proposal) => {
      const pid = BigInt(proposal.proposalId);

      let state = ProposalState.Pending;
      let votes = { againstVotes: 0n, forVotes: 0n, abstainVotes: 0n };
      let snapshot = 0n;
      let deadline = 0n;
      let quorumNeeded = 0n;
      let eta = 0n;
      let hasVoted = false;
      let userVotingPowerAtSnapshot = 0n;

      try {
        state = Number(await governor.state(pid));
      } catch (e) {
        console.warn(`Error reading state for proposal ${proposal.proposalId}:`, e.message);
      }

      try {
        const v = await governor.proposalVotes(pid);
        votes = {
          againstVotes: v[0],
          forVotes: v[1],
          abstainVotes: v[2],
        };
      } catch (e) {
        // ignore
      }

      try {
        snapshot = await governor.proposalSnapshot(pid);
        deadline = await governor.proposalDeadline(pid);
        quorumNeeded = await governor.quorum(snapshot);
      } catch (e) {
        // ignore
      }

      if (state === ProposalState.Queued || state === ProposalState.Executed) {
        try {
          eta = await governor.proposalEta(pid);
        } catch {
          eta = 0n;
        }
      }

      if (userAddress) {
        try {
          hasVoted = await governor.hasVoted(pid, userAddress);
          userVotingPowerAtSnapshot = await governor.getVotes(userAddress, snapshot);
        } catch {
          hasVoted = false;
        }
      }

      // Decode first action for easy card display
      let decodedAction = null;
      if (proposal.targets && proposal.targets.length > 0) {
        decodedAction = decodeProposalAction(
          proposal.targets[0],
          proposal.values[0] || 0n,
          proposal.calldatas[0] || '0x',
          addresses.Treasury,
          treasury.interface
        );
      }

      return {
        ...proposal,
        state,
        votes,
        snapshot,
        deadline,
        quorumNeeded,
        eta,
        hasVoted,
        userVotingPowerAtSnapshot,
        currentBlock,
        decodedAction,
      };
    })
  );

  // Sort newest proposal first
  return enrichedProposals.sort((a, b) => {
    try {
      const bId = BigInt(b.proposalId);
      const aId = BigInt(a.proposalId);
      return bId > aId ? 1 : bId < aId ? -1 : 0;
    } catch {
      return 0;
    }
  });
}

/**
 * Extracts a concise human-readable title from the proposal description
 */
export function extractProposalTitle(description) {
  if (!description) return 'Untitled Proposal';
  const firstLine = description.split('\n')[0].trim();
  if (firstLine.startsWith('# ')) {
    return firstLine.substring(2).trim();
  }
  return firstLine.length > 80 ? `${firstLine.substring(0, 77)}...` : firstLine;
}
