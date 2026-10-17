import React from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { ProposalStatusBadge } from './ProposalStatusBadge';
import { VoteBreakdown } from './VoteBreakdown';
import {
  shortenAddress,
  formatBlocksToTime,
} from '../../utils/formatters';
import { ProposalState } from '../../utils/constants';
import { CheckCircle2, Clock, User, ArrowUpRight, ShieldCheck } from 'lucide-react';

export function ProposalCard({
  proposal,
  onViewDetails,
  onVote,
  onQueue,
  onExecute,
}) {
  const isPending = proposal.state === ProposalState.Pending;
  const isActive = proposal.state === ProposalState.Active;
  const isSucceeded = proposal.state === ProposalState.Succeeded;
  const isQueued = proposal.state === ProposalState.Queued;
  const isExecuted = proposal.state === ProposalState.Executed;

  const currentBlock = proposal.currentBlock || 0;
  const blocksRemaining =
    proposal.deadline > BigInt(currentBlock)
      ? Number(proposal.deadline - BigInt(currentBlock))
      : 0;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const etaSeconds = Number(proposal.eta || 0n);
  const isEtaReached = etaSeconds > 0 && nowSeconds >= etaSeconds;

  return (
    <Card className="hover:border-slate-700/80 transition-all duration-200">
      <div className="space-y-4">
        {/* Card Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ProposalStatusBadge state={proposal.state} />
            {proposal.hasVoted && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                Voted
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-500" />
              {shortenAddress(proposal.proposer)}
            </span>
          </div>
        </div>

        {/* Proposal Title & Summary */}
        <div>
          <h3
            onClick={() => onViewDetails(proposal)}
            className="text-base font-semibold text-white tracking-tight hover:text-indigo-300 cursor-pointer transition-colors"
          >
            {proposal.title}
          </h3>
          <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
            {proposal.description}
          </p>
        </div>

        {/* Decoded Action Tag */}
        {proposal.decodedAction && (
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
            <div className="flex items-center gap-2 truncate">
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                {proposal.decodedAction.type === 'TREASURY_ETH' ? 'ETH Disbursal' : 'Treasury Action'}
              </span>
              <span className="truncate text-xs text-slate-300 font-medium">
                {proposal.decodedAction.summary}
              </span>
            </div>
          </div>
        )}

        {/* Voting & Quorum Progress */}
        <div className="pt-2">
          <VoteBreakdown votes={proposal.votes} quorumNeeded={proposal.quorumNeeded} />
        </div>

        {/* Card Footer */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            {isActive ? (
              <span>
                Active: <span className="font-semibold text-indigo-400">{formatBlocksToTime(blocksRemaining)}</span> left
              </span>
            ) : isQueued ? (
              <span className="flex items-center gap-1 text-cyan-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                {isEtaReached ? 'Timelock elapsed' : 'Timelock queued'}
              </span>
            ) : (
              <span>Deadline: Block {proposal.deadline?.toString()}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onViewDetails(proposal)}
            >
              Details
            </Button>

            {isActive && (
              <Button
                size="sm"
                variant="primary"
                disabled={proposal.hasVoted || proposal.userVotingPowerAtSnapshot === 0n}
                onClick={() => onVote(proposal)}
              >
                {proposal.hasVoted ? 'Voted' : 'Vote'}
              </Button>
            )}

            {isSucceeded && (
              <Button
                size="sm"
                variant="success"
                onClick={() => onViewDetails(proposal)}
              >
                Queue
              </Button>
            )}

            {isQueued && (
              <Button
                size="sm"
                variant="success"
                onClick={() => onViewDetails(proposal)}
              >
                Execute
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
