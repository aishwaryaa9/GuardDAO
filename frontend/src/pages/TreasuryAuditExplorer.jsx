import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { Clipboard, Download, RefreshCw, Search } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { useToast } from '../context/ToastContext';
import {
  AUDIT_PAGE_SIZE,
  createAuditCsv,
  filterAuditRecords,
  getTransactionDetails,
  loadCurrentAuditBalances,
  paginateRecords,
  scanAuditEvents,
} from '../services/auditExplorer';
import { copyText } from '../services/evidenceService';
import { getJsonRpcProvider } from '../services/provider';

function formatEth(value) {
  try {
    const formatted = ethers.formatEther(value);
    const [whole, fraction] = formatted.split('.');
    return `${whole}.${(fraction || '').slice(0, 4)}`;
  } catch {
    return 'Unavailable';
  }
}

function formatTimestamp(timestamp) {
  return timestamp === null
    ? 'Unavailable'
    : new Date(timestamp * 1000).toLocaleString();
}

function eventSummary(record) {
  const { args } = record;
  if (record.eventType === 'EthDisbursed') {
    return `${formatEth(args.amount)} ETH to ${args.to}`;
  }
  if (record.eventType === 'TokenDisbursed') {
    return `${args.amount} token base units to ${args.to}`;
  }
  if (record.eventType === 'MilestoneReleased' || record.eventType === 'MilestoneRefunded') {
    return `${formatEth(args.amount)} ETH · plan ${args.planId}`;
  }
  if (record.eventType === 'PlanCreated') return `Plan ${args.planId} · ${formatEth(args.amount)} ETH`;
  if (record.eventType === 'MilestoneSubmitted') return `Evidence submitted for plan ${args.planId}, milestone ${args.milestoneIndex}`;
  if (args.proposalId) return `Proposal ${args.proposalId}`;
  if (args.planId) return `Plan ${args.planId}`;
  if (args.contributionId) return `Contribution ${args.contributionId}`;
  return '';
}

function StatCard({ title, value, detail }) {
  return (
    <Card title={title} subtitle={detail}>
      <p className="font-mono text-2xl text-white">{value}</p>
    </Card>
  );
}

export function TreasuryAuditExplorer() {
  const { addToast } = useToast();
  const [records, setRecords] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [balances, setBalances] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const [loading, setLoading] = useState(false);
  const [eventType, setEventType] = useState('');
  const [search, setSearch] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [fromBlock, setFromBlock] = useState('');
  const [toBlock, setToBlock] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const didInitialLoad = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setBalanceError('');
    setSelected(null);
    setDetails(null);
    try {
      const range = {};
      if (fromBlock.trim()) range.fromBlock = fromBlock.trim();
      if (toBlock.trim()) range.toBlock = toBlock.trim();
      const [scanResult, balanceResult] = await Promise.allSettled([
        scanAuditEvents(range),
        loadCurrentAuditBalances(),
      ]);
      if (scanResult.status === 'rejected') {
        throw scanResult.reason;
      }
      setRecords(scanResult.value.records);
      setCoverage(scanResult.value.coverage);
      if (balanceResult.status === 'fulfilled') {
        setBalances(balanceResult.value);
      } else {
        setBalances(null);
        setBalanceError(balanceResult.reason.message || 'Current on-chain balances are unavailable.');
      }
    } catch (error) {
      setRecords([]);
      setCoverage(null);
      setBalances(null);
      setLoadError(error.message || 'Could not retrieve audit events from the configured chain.');
    } finally {
      setLoading(false);
    }
  }, [fromBlock, toBlock]);

  useEffect(() => {
    if (!didInitialLoad.current) {
      didInitialLoad.current = true;
      refresh();
    }
  }, [refresh]);

  const filteredRecords = useMemo(() => filterAuditRecords(records, {
    eventType,
    search,
    identifier,
    fromBlock: coverage?.fromBlock ?? '',
    toBlock: coverage?.toBlock ?? '',
  }), [records, eventType, search, identifier, coverage]);

  const pagination = useMemo(
    () => paginateRecords(filteredRecords, page, AUDIT_PAGE_SIZE),
    [filteredRecords, page]
  );

  const eventTypes = useMemo(
    () => [...new Set(records.map((record) => record.eventType))].sort(),
    [records]
  );

  const summary = useMemo(() => {
    const treasuryTransactions = new Set(
      records.filter((record) => ['EthDisbursed', 'TokenDisbursed'].includes(record.eventType))
        .map((record) => record.txHash)
    );
    const released = records
      .filter((record) => record.eventType === 'MilestoneReleased')
      .reduce((total, record) => total + BigInt(record.args.amount), 0n);
    const refunded = records
      .filter((record) => record.eventType === 'MilestoneRefunded')
      .reduce((total, record) => total + BigInt(record.args.amount), 0n);
    return {
      proposals: records.filter((record) => record.eventType === 'ProposalCreated').length,
      treasuryTransactions: treasuryTransactions.size,
      released,
      refunded,
    };
  }, [records]);

  useEffect(() => setPage(1), [eventType, search, identifier, fromBlock, toBlock]);

  const openDetails = async (record) => {
    setSelected(record);
    setDetails(null);
    setDetailsLoading(true);
    try {
      setDetails(await getTransactionDetails(getJsonRpcProvider(), record));
    } catch (error) {
      setDetails({ status: 'unavailable', error: error.message || 'Receipt or block details are unavailable.' });
    } finally {
      setDetailsLoading(false);
    }
  };

  const exportCsv = () => {
    if (!coverage) return;
    const csv = createAuditCsv(filteredRecords, coverage.chainId || 31337);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `guarddao-audit-chain-${coverage.chainId}-${Date.now()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setExportMessage(`Exported ${filteredRecords.length} retrieved record(s); this is a data export, not a certified audit.`);
  };

  const copyHash = async (hash) => {
    try {
      await copyText(hash);
      addToast({ title: 'Transaction hash copied', message: hash, type: 'success' });
    } catch (error) {
      addToast({ title: 'Could not copy hash', message: error.message, type: 'error' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Treasury Audit Explorer</h1>
          <p className="mt-1 text-sm text-slate-400">
            Read-only governance, Treasury, escrow, and reputation events from the configured local chain.
          </p>
        </div>
        <Button variant="outline" icon={RefreshCw} onClick={refresh} isLoading={loading}>
          Refresh on-chain records
        </Button>
      </div>

      <Card className="border-amber-500/20">
        <p className="text-sm text-amber-100">
          Local development environment · Chain ID 31337. Only mined events are shown; pending transactions are excluded.
          Results are limited to the displayed block range and may be partial if the RPC cannot serve all logs.
          This explorer and its CSV export are not a certified legal audit.
        </p>
      </Card>

      {loadError && <p role="alert" className="text-sm text-rose-300">{loadError}</p>}
      {balanceError && <p role="status" className="text-sm text-amber-300">{balanceError}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Current Treasury ETH"
          value={balances ? `${formatEth(balances.treasuryBalance)} ETH` : 'Unavailable'}
          detail="Current on-chain balance, not historical spending"
        />
        <StatCard
          title="Escrow unallocated ETH"
          value={balances ? `${formatEth(balances.unallocatedFunding)} ETH` : 'Unavailable'}
          detail="Current funding not assigned to a plan"
        />
        <StatCard title="Observed proposals" value={summary.proposals} detail="ProposalCreated logs in scanned range" />
        <StatCard title="Observed Treasury transactions" value={summary.treasuryTransactions} detail="Distinct confirmed disbursement transactions" />
        <StatCard title="Released in scanned range" value={`${formatEth(summary.released)} ETH`} detail="Sum of retrieved MilestoneReleased events" />
        <StatCard title="Refunded in scanned range" value={`${formatEth(summary.refunded)} ETH`} detail="Sum of retrieved MilestoneRefunded events" />
      </div>

      {coverage && (
        <Card title="Log coverage" subtitle={`Blocks ${coverage.fromBlock.toLocaleString()}–${coverage.toBlock.toLocaleString()} · head ${coverage.headBlock.toLocaleString()}`}>
          <p className={coverage.complete ? 'text-sm text-emerald-300' : 'text-sm text-amber-300'}>
            {coverage.complete ? 'All queried contract ranges were retrieved.' : 'Partial data: one or more log, decode, or timestamp lookups failed.'}
          </p>
          {coverage.failures.length > 0 && (
            <ul className="mt-2 list-inside list-disc break-words text-xs text-amber-200">
              {coverage.failures.map((failure, index) => (
                <li key={`${failure.contract}-${failure.fromBlock}-${index}`}>
                  {failure.contract}, blocks {failure.fromBlock}–{failure.toBlock}: {failure.message}
                </li>
              ))}
            </ul>
          )}
          {coverage.decodeFailures > 0 && <p className="mt-2 text-xs text-amber-200">Could not decode {coverage.decodeFailures} log(s).</p>}
          {coverage.timestampFailures.length > 0 && <p className="mt-2 text-xs text-amber-200">Timestamps unavailable for {coverage.timestampFailures.length} block(s).</p>}
        </Card>
      )}

      <Card title="Transaction history" subtitle="Data is read from contract logs; browsing does not require wallet connection or signatures.">
        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1 text-xs text-slate-300">
            <span className="block">Event type</span>
            <select value={eventType} onChange={(event) => setEventType(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-100">
              <option value="">All retrieved events</option>
              {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <Input label="Transaction hash" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="0x…" />
          <Input label="Proposal / plan ID" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Identifier" />
          <Input label="From block" type="number" min="0" value={fromBlock} onChange={(event) => setFromBlock(event.target.value)} placeholder={coverage ? String(coverage.fromBlock) : 'Default range'} />
          <Input label="To block" type="number" min="0" value={toBlock} onChange={(event) => setToBlock(event.target.value)} placeholder={coverage ? String(coverage.toBlock) : 'Current head'} />
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            {filteredRecords.length.toLocaleString()} retrieved record(s); queries use bounded ranges of at most 100,000 blocks and 2,000-block chunks.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" icon={Search} onClick={refresh} disabled={loading}>Apply block range</Button>
            <Button size="sm" variant="outline" icon={Download} onClick={exportCsv} disabled={!coverage || filteredRecords.length === 0}>Export filtered CSV</Button>
          </div>
        </div>
        {exportMessage && <p role="status" className="mb-3 text-xs text-slate-400">{exportMessage}</p>}

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">Reading confirmed events from the local chain…</p>
        ) : pagination.pageRecords.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No matching events were retrieved for this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-3 py-3">Block / time</th>
                  <th className="px-3 py-3">Event</th>
                  <th className="px-3 py-3">Transaction</th>
                  <th className="px-3 py-3">Contract / details</th>
                  <th className="px-3 py-3">Inspect</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageRecords.map((record) => (
                  <React.Fragment key={record.id}>
                    <tr className="border-b border-slate-900 align-top hover:bg-slate-900/50">
                      <td className="px-3 py-3">
                        <p className="font-mono text-slate-200">#{record.blockNumber}</p>
                        <p className="mt-1 text-slate-500">{formatTimestamp(record.timestamp)}</p>
                      </td>
                      <td className="px-3 py-3 font-medium text-indigo-200">{record.eventType}</td>
                      <td className="max-w-56 px-3 py-3">
                        <p className="break-all font-mono text-slate-300">{record.txHash}</p>
                        <p className="mt-1 text-[11px] text-emerald-400">Mined event log</p>
                        <Button size="sm" variant="ghost" icon={Clipboard} className="mt-1" onClick={() => copyHash(record.txHash)}>Copy hash</Button>
                      </td>
                      <td className="max-w-80 px-3 py-3">
                        <p className="text-slate-200">{record.contractName}</p>
                        <p className="mt-1 break-all font-mono text-slate-500">{record.contractAddress}</p>
                        <p className="mt-1 break-words text-slate-400">{eventSummary(record)}</p>
                      </td>
                      <td className="px-3 py-3">
                        <Button size="sm" variant="outline" onClick={() => openDetails(record)}>Details</Button>
                      </td>
                    </tr>
                    {selected?.id === record.id && (
                      <tr className="border-b border-slate-800 bg-slate-950/60">
                        <td colSpan={5} className="p-4">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div>
                              <h3 className="mb-2 text-sm font-semibold text-white">Decoded event arguments</h3>
                              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-[11px] text-slate-300">
                                {JSON.stringify(record.args, null, 2)}
                              </pre>
                              {record.relatedProposalIds?.map((proposalId) => (
                                <p key={proposalId} className="mt-2 break-all text-xs text-indigo-300">Related executed proposal: {proposalId}</p>
                              ))}
                              <p className="mt-2 text-[11px] text-slate-500">No external explorer link is provided for local chain 31337.</p>
                            </div>
                            <div>
                              <h3 className="mb-2 text-sm font-semibold text-white">Transaction receipt and block</h3>
                              {detailsLoading ? (
                                <p className="text-xs text-slate-400">Loading receipt and block…</p>
                              ) : details?.error ? (
                                <p role="status" className="text-xs text-amber-300">{details.error}</p>
                              ) : details ? (
                                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 break-all text-xs">
                                  <dt className="text-slate-500">Receipt status</dt><dd className={details.status === 'confirmed' ? 'text-emerald-300' : 'text-amber-300'}>{details.status}</dd>
                                  <dt className="text-slate-500">From</dt><dd className="font-mono text-slate-300">{details.from || 'Unknown'}</dd>
                                  <dt className="text-slate-500">To</dt><dd className="font-mono text-slate-300">{details.to || 'Unknown'}</dd>
                                  <dt className="text-slate-500">Block hash</dt><dd className="font-mono text-slate-300">{details.blockHash || 'Unavailable'}</dd>
                                  <dt className="text-slate-500">Block time</dt><dd className="text-slate-300">{formatTimestamp(details.timestamp)}</dd>
                                  <dt className="text-slate-500">Gas used</dt><dd className="font-mono text-slate-300">{details.gasUsed || 'Unknown'}</dd>
                                </dl>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-4 text-xs text-slate-400">
          <span>Page {pagination.page} of {pagination.pageCount}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={pagination.page <= 1}>Previous</Button>
            <Button size="sm" variant="outline" onClick={() => setPage((current) => Math.min(pagination.pageCount, current + 1))} disabled={pagination.page >= pagination.pageCount}>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
