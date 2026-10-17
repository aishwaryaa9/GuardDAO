import { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { loadDaoOverview } from '../services/contracts';

export function useGovernance() {
  const { address, rpcStatus } = useWeb3();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const overview = await loadDaoOverview(address);
      setData(overview);
    } catch (err) {
      console.error('Failed to load DAO overview:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview, rpcStatus.blockNumber]);

  return {
    ...data,
    loading,
    error,
    refresh: fetchOverview,
  };
}
