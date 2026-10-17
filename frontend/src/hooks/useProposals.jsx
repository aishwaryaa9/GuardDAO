import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { fetchAllProposals } from '../services/proposalIndexer';

export function useProposals() {
  const { address, rpcStatus } = useWeb3();
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const loadProposals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await fetchAllProposals(address);
      setProposals(list);
    } catch (err) {
      console.error('Failed to load proposals:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    loadProposals();
  }, [loadProposals, rpcStatus.blockNumber]);

  // Statistics across proposals
  const stats = useMemo(() => {
    const total = proposals.length;
    let pending = 0;
    let active = 0;
    let succeeded = 0;
    let queued = 0;
    let executed = 0;
    let defeated = 0;
    let canceled = 0;

    proposals.forEach((p) => {
      switch (p.state) {
        case 0:
          pending++;
          break;
        case 1:
          active++;
          break;
        case 2:
          canceled++;
          break;
        case 3:
          defeated++;
          break;
        case 4:
          succeeded++;
          break;
        case 5:
          queued++;
          break;
        case 7:
          executed++;
          break;
        default:
          break;
      }
    });

    return { total, pending, active, succeeded, queued, executed, defeated, canceled };
  }, [proposals]);

  // Filtered and searched proposals
  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      // Filter by state
      if (selectedFilter !== 'ALL') {
        const stateNum = Number(selectedFilter);
        if (p.state !== stateNum) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = p.proposalId.toLowerCase().includes(q);
        const matchesDesc = (p.description || '').toLowerCase().includes(q);
        const matchesTitle = (p.title || '').toLowerCase().includes(q);
        const matchesProposer = (p.proposer || '').toLowerCase().includes(q);
        return matchesId || matchesDesc || matchesTitle || matchesProposer;
      }

      return true;
    });
  }, [proposals, selectedFilter, searchQuery]);

  return {
    proposals: filteredProposals,
    allProposals: proposals,
    stats,
    loading,
    error,
    selectedFilter,
    setSelectedFilter,
    searchQuery,
    setSearchQuery,
    refresh: loadProposals,
  };
}
