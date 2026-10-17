import React, { useState } from 'react';
import { ProposalCard } from '../components/proposals/ProposalCard';
import { CardSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { ProposalState } from '../utils/constants';
import { Search, PlusCircle, Filter } from 'lucide-react';

export function Proposals({
  proposalsData,
  onNavigate,
  onViewProposal,
  onVoteProposal,
}) {
  const {
    proposals,
    allProposals,
    stats,
    loading,
    selectedFilter,
    setSelectedFilter,
    searchQuery,
    setSearchQuery,
  } = proposalsData;

  const filterTabs = [
    { id: 'ALL', label: 'All', count: stats.total },
    { id: String(ProposalState.Active), label: 'Active', count: stats.active },
    { id: String(ProposalState.Pending), label: 'Pending', count: stats.pending },
    { id: String(ProposalState.Succeeded), label: 'Succeeded', count: stats.succeeded },
    { id: String(ProposalState.Queued), label: 'Queued', count: stats.queued },
    { id: String(ProposalState.Executed), label: 'Executed', count: stats.executed },
    { id: String(ProposalState.Defeated), label: 'Defeated', count: stats.defeated },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Proposals</h1>
          <p className="text-xs text-slate-400 mt-1">
            Browse, inspect, vote, and execute on-chain governance proposals.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => onNavigate('create')}
          icon={PlusCircle}
        >
          Create Proposal
        </Button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* State Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          {filterTabs.map((tab) => {
            const isActive = selectedFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-indigo-700/60 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="w-full md:w-72 shrink-0">
          <Input
            placeholder="Search proposals by title, ID, proposer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            prefix={<Search className="w-4 h-4 text-slate-500" />}
          />
        </div>
      </div>

      {/* Proposals Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : proposals.length === 0 ? (
        <EmptyState
          title={searchQuery || selectedFilter !== 'ALL' ? 'No matching proposals' : 'No proposals created yet'}
          description={
            searchQuery || selectedFilter !== 'ALL'
              ? 'Try adjusting your search criteria or resetting the state filter.'
              : 'Create the first proposal to allocate funds or execute contract actions.'
          }
          actionLabel={searchQuery || selectedFilter !== 'ALL' ? 'Reset Filters' : 'Create Proposal'}
          onAction={() => {
            if (searchQuery || selectedFilter !== 'ALL') {
              setSearchQuery('');
              setSelectedFilter('ALL');
            } else {
              onNavigate('create');
            }
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {proposals.map((proposal) => (
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
  );
}
