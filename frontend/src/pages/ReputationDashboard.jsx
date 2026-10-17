import React, { useCallback, useEffect, useState } from 'react';
import { Award, RefreshCw } from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { useWeb3 } from '../context/Web3Context';
import { getTokenContract, getReputationContract } from '../services/contracts';
import { getJsonRpcProvider } from '../services/provider';
import { formatTimestamp, shortenAddress } from '../utils/formatters';

const CATEGORY_NAMES = [
  'Approved milestone completion',
  'Verified contribution',
  'Authorized review participation',
];

export function ReputationDashboard() {
  const { address, rpcStatus } = useWeb3();
  const [points, setPoints] = useState(null);
  const [votingPower, setVotingPower] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyTruncated, setHistoryTruncated] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const provider = getJsonRpcProvider();
      const reputation = getReputationContract(provider);
      const token = getTokenContract(provider);
      if (!address) {
        setPoints(null);
        setVotingPower(null);
        setHistory([]);
        return;
      }

      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100000);
      const [currentPoints, currentVotes, awards, revocations] = await Promise.all([
        reputation.reputationOf(address),
        token.getVotes(address),
        reputation.queryFilter(reputation.filters.ReputationAwarded(address), fromBlock, 'latest'),
        reputation.queryFilter(reputation.filters.ReputationRevoked(address), fromBlock, 'latest'),
      ]);
      setPoints(currentPoints);
      setVotingPower(currentVotes);
      setHistoryTruncated(fromBlock > 0);
      const entries = [
        ...awards.map((event) => ({
          key: `award-${event.transactionHash}-${event.index}`,
          type: 'Award',
          contributionId: event.args.contributionId,
          category: CATEGORY_NAMES[Number(event.args.category)] || 'Unknown category',
          points: event.args.points,
          actor: event.args.awarder,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
        })),
        ...revocations.map((event) => ({
          key: `revoke-${event.transactionHash}-${event.index}`,
          type: 'Revocation',
          contributionId: event.args.contributionId,
          category: event.args.reason,
          points: event.args.points,
          actor: event.args.revoker,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
        })),
      ].sort((a, b) => b.blockNumber - a.blockNumber);
      setHistory(entries);
    } catch (cause) {
      setError(cause.message || 'Could not read reputation data from the active local chain.');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh, rpcStatus.blockNumber]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Governance Reputation</h1>
          <p className="mt-1 text-sm text-slate-400">
            Auditable contribution points are separate from GOV token ownership and voting power.
          </p>
        </div>
        <Button variant="outline" onClick={refresh} icon={RefreshCw} disabled={loading}>Refresh</Button>
      </div>

      <Card className="border-amber-500/20">
        <p className="text-sm text-amber-100">
          Reputation is not identity and does not increase Governor voting weight. Wallets can be
          Sybil-created; reviewers can make mistakes or collude. Awards rely on authorized
          verification decisions and do not independently prove contribution.
        </p>
      </Card>

      {!address && (
        <Card title="Connect a wallet to view account reputation">
          <p className="text-sm text-slate-400">The total and history are read from the active local chain for the connected address.</p>
        </Card>
      )}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {loading && <p className="text-sm text-slate-400">Reading on-chain reputation…</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Reputation points" subtitle={address ? shortenAddress(address, 6) : 'No wallet connected'}>
          <div className="flex items-center gap-3">
            <Award className="h-7 w-7 text-amber-300" />
            <span className="font-mono text-3xl text-white">{points === null ? '—' : points.toString()}</span>
          </div>
        </Card>
        <Card title="GOV voting power" subtitle="ERC-20Votes checkpoint; reputation is not included">
          <p className="font-mono text-3xl text-indigo-200">{votingPower === null ? '—' : votingPower.toString()}</p>
        </Card>
      </div>

      <Card title="Contribution and revocation history" subtitle="Recent 100,000 local-chain blocks for this address">
        {historyTruncated && (
          <p className="mb-3 text-xs text-amber-300">Older event history is not included in this view.</p>
        )}
        {history.length === 0 && !loading ? (
          <p className="text-sm text-slate-400">No reputation events found for this address in the scanned block range.</p>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <div key={entry.key} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={entry.type === 'Award' ? 'font-semibold text-emerald-300' : 'font-semibold text-rose-300'}>
                    {entry.type}: {entry.points.toString()} points
                  </p>
                  <span className="text-xs text-slate-400">Block {entry.blockNumber}</span>
                </div>
                <p className="mt-1 text-xs text-slate-300">{entry.category}</p>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-400">Contribution: {entry.contributionId}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {entry.type === 'Award' ? 'Awarder' : 'Revoker'}: {shortenAddress(entry.actor, 6)}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-400" title={entry.transactionHash}>
                  Local transaction hash: {entry.transactionHash}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
