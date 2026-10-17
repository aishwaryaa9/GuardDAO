/**
 * OpenZeppelin Governor ProposalState enum (OZ v5)
 */
export const ProposalState = {
  Pending: 0,
  Active: 1,
  Canceled: 2,
  Defeated: 3,
  Succeeded: 4,
  Queued: 5,
  Expired: 6,
  Executed: 7,
};

export const ProposalStateMeta = {
  0: {
    label: 'Pending',
    description: 'Proposal created, waiting for voting delay to pass before voting begins.',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    dotClass: 'bg-amber-400',
  },
  1: {
    label: 'Active',
    description: 'Voting is open. Token holders with delegated power at snapshot can vote.',
    badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 animate-pulse',
    dotClass: 'bg-indigo-400',
  },
  2: {
    label: 'Canceled',
    description: 'Proposal was canceled by the proposer before execution.',
    badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    dotClass: 'bg-slate-400',
  },
  3: {
    label: 'Defeated',
    description: 'Proposal did not meet quorum or Against votes outnumbered For votes.',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    dotClass: 'bg-rose-400',
  },
  4: {
    label: 'Succeeded',
    description: 'Voting concluded successfully. Proposal reached quorum and For > Against. Ready to queue.',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dotClass: 'bg-emerald-400',
  },
  5: {
    label: 'Queued',
    description: 'Proposal has been queued into the Timelock. Waiting for the execution delay to elapse.',
    badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    dotClass: 'bg-cyan-400',
  },
  6: {
    label: 'Expired',
    description: 'Queued proposal was not executed before its grace period expired.',
    badgeClass: 'bg-red-500/10 text-red-400 border-red-500/20',
    dotClass: 'bg-red-400',
  },
  7: {
    label: 'Executed',
    description: 'Proposal actions were successfully executed through the Timelock Controller.',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    dotClass: 'bg-emerald-300',
  },
};

/**
 * GovernorCountingSimple VoteType enum
 */
export const VoteType = {
  Against: 0,
  For: 1,
  Abstain: 2,
};

export const VoteTypeMeta = {
  0: { label: 'Against', color: 'rose', badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  1: { label: 'For', color: 'emerald', badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  2: { label: 'Abstain', color: 'slate', badgeClass: 'bg-slate-500/10 text-slate-300 border-slate-500/30' },
};

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const HARDHAT_CHAIN_ID = 31337;
export const HARDHAT_CHAIN_HEX = '0x7a69';

export const DEFAULT_RPC_URL = 'http://127.0.0.1:8545';
