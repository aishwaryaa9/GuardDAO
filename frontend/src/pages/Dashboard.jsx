import React from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { ProposalCard } from '../components/proposals/ProposalCard';
import { LoadingSkeleton, CardSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import {
  formatTokens,
  formatEther,
  shortenAddress,
} from '../utils/formatters';
import {
  Shield,
  Coins,
  Vault,
  Vote,
  PlusCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';

export function Dashboard({
  governanceData,
  proposalsData,
  onNavigate,
  onViewProposal,
  onVoteProposal,
}) {
  const { token, governor, timelock, treasury, loading: govLoading } = governanceData;
  const { proposals, stats, loading: propLoading } = proposalsData;

  const recentProposals = proposals.slice(0, 3);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Hero Welcome Banner */}
      <div className="relative rounded-3xl p-6 sm:p-8 overflow-hidden glass-panel border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 via-slate-900/60 to-purple-950/30">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>On-Chain Governance • OpenZeppelin v5</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            GuardDAO Governance Dashboard
          </h1>

          <p className="text-sm text-slate-300 leading-relaxed">
            Transparent decentralized decision making powered by ERC-20 vote delegation,
            quorum validation, and timelock-protected execution.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => onNavigate('create')}
              icon={PlusCircle}
            >
              New Proposal
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onNavigate('token')}
              icon={Coins}
            >
              Delegate Voting Power
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('treasury')}
              icon={Vault}
            >
              View Treasury
            </Button>
          </div>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: User Voting Power */}
        <Card className="hover:border-indigo-500/30">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Your Voting Power</span>
              <Vote className="w-4 h-4 text-indigo-400" />
            </div>
            {govLoading ? (
              <LoadingSkeleton className="h-8 w-24" />
            ) : (
              <div>
                <span className="text-2xl font-bold text-white font-mono">
                  {formatTokens(token?.userVotingPower)}
                </span>
                <span className="text-xs text-slate-400 ml-1.5 font-mono">GOV</span>
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              Balance: <span className="text-slate-300 font-mono">{formatTokens(token?.userBalance)} GOV</span>
            </p>
          </div>
        </Card>

        {/* Metric 2: Total Token Supply */}
        <Card className="hover:border-violet-500/30">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Total GOV Supply</span>
              <Coins className="w-4 h-4 text-violet-400" />
            </div>
            {govLoading ? (
              <LoadingSkeleton className="h-8 w-24" />
            ) : (
              <div>
                <span className="text-2xl font-bold text-white font-mono">
                  {formatTokens(token?.totalSupply)}
                </span>
                <span className="text-xs text-slate-400 ml-1.5 font-mono">GOV</span>
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              Quorum: <span className="text-slate-300 font-mono">{governor?.quorumNumerator?.toString()}% of supply</span>
            </p>
          </div>
        </Card>

        {/* Metric 3: Treasury ETH Balance */}
        <Card className="hover:border-emerald-500/30">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Treasury ETH</span>
              <Vault className="w-4 h-4 text-emerald-400" />
            </div>
            {govLoading ? (
              <LoadingSkeleton className="h-8 w-24" />
            ) : (
              <div>
                <span className="text-2xl font-bold text-white font-mono">
                  {formatEther(treasury?.ethBalance, 3)}
                </span>
                <span className="text-xs text-slate-400 ml-1.5 font-mono">ETH</span>
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              Spends require passed proposals
            </p>
          </div>
        </Card>

        {/* Metric 4: Active Proposals */}
        <Card className="hover:border-cyan-500/30">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Active Proposals</span>
              <Clock className="w-4 h-4 text-cyan-400" />
            </div>
            {propLoading ? (
              <LoadingSkeleton className="h-8 w-16" />
            ) : (
              <div>
                <span className="text-2xl font-bold text-white font-mono">
                  {stats.active}
                </span>
                <span className="text-xs text-slate-400 ml-1.5">
                  of {stats.total} total
                </span>
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              {stats.queued} in Timelock queue
            </p>
          </div>
        </Card>
      </div>

      {/* Governance Parameters Overview & Proposal State Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Proposal Statistics by State */}
        <Card
          title="Proposal Status Breakdown"
          subtitle="Distribution of all on-chain proposals"
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-400 block">Pending</span>
              <span className="text-xl font-bold text-amber-400 font-mono mt-1 block">
                {stats.pending}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Waiting for delay</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-400 block">Active</span>
              <span className="text-xl font-bold text-indigo-400 font-mono mt-1 block">
                {stats.active}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Voting currently open</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-400 block">Queued</span>
              <span className="text-xl font-bold text-cyan-400 font-mono mt-1 block">
                {stats.queued}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">In Timelock delay</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-400 block">Executed</span>
              <span className="text-xl font-bold text-emerald-400 font-mono mt-1 block">
                {stats.executed}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Actions performed</span>
            </div>
          </div>
        </Card>

        {/* Contract Configuration Parameters */}
        <Card
          title="Protocol Parameters"
          subtitle="Configured smart contract rules"
        >
          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Voting Delay</span>
              <span className="font-mono text-slate-200">
                {governor?.votingDelay?.toString()} block (immediate)
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Voting Period</span>
              <span className="font-mono text-slate-200">
                {governor?.votingPeriod?.toString()} blocks (~1 week)
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Proposal Threshold</span>
              <span className="font-mono text-slate-200">
                {formatTokens(governor?.proposalThreshold)} GOV
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Quorum Requirement</span>
              <span className="font-mono text-slate-200">
                {governor?.quorumNumerator?.toString()}% of supply (40,000 GOV)
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5">
              <span className="text-slate-400">Timelock Min Delay</span>
              <span className="font-mono text-slate-200">
                {Number(timelock?.minDelay || 86400n) / 3600} hours (86,400s)
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Proposals Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Recent Proposals</h2>
            <p className="text-xs text-slate-400">Latest activity on the Governor contract</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigate('proposals')}
          >
            View All ({proposals.length})
          </Button>
        </div>

        {propLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : recentProposals.length === 0 ? (
          <EmptyState
            title="No proposals found yet"
            description="No proposals have been submitted to this Governor contract yet. You can create the first proposal to disburse treasury funds."
            actionLabel="Create First Proposal"
            onAction={() => onNavigate('create')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentProposals.map((proposal) => (
              <ProposalCard
                key={proposal.proposalId}
                proposal={proposal}
                onViewDetails={onViewProposal}
                onVote={onVoteProposal}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
