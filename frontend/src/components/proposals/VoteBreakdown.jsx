import React from 'react';
import { formatTokens, calculatePercentage } from '../../utils/formatters';
import { CheckCircle2, XCircle } from 'lucide-react';

export function VoteBreakdown({ votes, quorumNeeded, showQuorum = true }) {
  const forVotes = votes?.forVotes || 0n;
  const againstVotes = votes?.againstVotes || 0n;
  const abstainVotes = votes?.abstainVotes || 0n;

  const totalVotesCast = forVotes + againstVotes + abstainVotes;

  // Percentages of total cast
  const forPct = calculatePercentage(forVotes, totalVotesCast);
  const againstPct = calculatePercentage(againstVotes, totalVotesCast);
  const abstainPct = calculatePercentage(abstainVotes, totalVotesCast);

  // Quorum is typically For + Abstain in GovernorCountingSimple
  const quorumCount = forVotes + abstainVotes;
  const quorumPct = calculatePercentage(quorumCount, quorumNeeded || 1n);
  const isQuorumReached = quorumNeeded ? quorumCount >= quorumNeeded : false;

  return (
    <div className="space-y-3 w-full">
      {/* Visual Multi-Segment Vote Bar */}
      <div className="w-full h-2.5 rounded-full bg-slate-800/80 overflow-hidden flex">
        {forPct > 0 && (
          <div
            className="bg-emerald-500 h-full transition-all duration-300"
            style={{ width: `${forPct}%` }}
            title={`For: ${formatTokens(forVotes)} GOV (${forPct.toFixed(1)}%)`}
          />
        )}
        {againstPct > 0 && (
          <div
            className="bg-rose-500 h-full transition-all duration-300"
            style={{ width: `${againstPct}%` }}
            title={`Against: ${formatTokens(againstVotes)} GOV (${againstPct.toFixed(1)}%)`}
          />
        )}
        {abstainPct > 0 && (
          <div
            className="bg-slate-500 h-full transition-all duration-300"
            style={{ width: `${abstainPct}%` }}
            title={`Abstain: ${formatTokens(abstainVotes)} GOV (${abstainPct.toFixed(1)}%)`}
          />
        )}
      </div>

      {/* Numerical breakdown */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex flex-col">
          <span className="text-slate-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            For
          </span>
          <span className="font-semibold text-slate-200 mt-0.5">
            {formatTokens(forVotes)} <span className="text-[10px] text-slate-400">({forPct.toFixed(0)}%)</span>
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-slate-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Against
          </span>
          <span className="font-semibold text-slate-200 mt-0.5">
            {formatTokens(againstVotes)} <span className="text-[10px] text-slate-400">({againstPct.toFixed(0)}%)</span>
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-slate-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Abstain
          </span>
          <span className="font-semibold text-slate-200 mt-0.5">
            {formatTokens(abstainVotes)} <span className="text-[10px] text-slate-400">({abstainPct.toFixed(0)}%)</span>
          </span>
        </div>
      </div>

      {/* Quorum Progress */}
      {showQuorum && quorumNeeded > 0n && (
        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            {isQuorumReached ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span className="text-slate-400">Quorum:</span>
            <span className="font-medium text-slate-300">
              {formatTokens(quorumCount)} / {formatTokens(quorumNeeded)} GOV
            </span>
          </div>
          <span className={`font-mono text-[11px] ${isQuorumReached ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
            {quorumPct.toFixed(1)}% {isQuorumReached ? 'Reached' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
