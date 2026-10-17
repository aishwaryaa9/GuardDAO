import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Card } from '../components/common/Card';
import { assessProposalRisk } from '../services/riskAssessment';
import { shortenAddress } from '../utils/formatters';

export function RiskAssessment({ proposalsData }) {
  const {
    allProposals,
    loading: proposalsLoading,
    error: proposalsError,
  } = proposalsData;
  const [selectedId, setSelectedId] = useState('');
  const [assessment, setAssessment] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedId && allProposals.length > 0) {
      setSelectedId(allProposals[0].proposalId);
    }
  }, [allProposals, selectedId]);

  const selectedProposal = allProposals.find((proposal) => proposal.proposalId === selectedId);

  useEffect(() => {
    let cancelled = false;
    if (!selectedProposal) {
      setAssessment([]);
      return undefined;
    }

    setLoading(true);
    setError('');
    assessProposalRisk(selectedProposal)
      .then((items) => {
        if (!cancelled) setAssessment(items);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause.message || 'Could not assess this proposal against live policies.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProposal]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <h1 className="text-2xl font-bold text-white">Proposal Risk Assessment</h1>
        <p className="mt-1 text-sm text-slate-400">
          Current on-chain guardrail checks plus contextual warnings for proposal actions.
        </p>
      </div>

      <Card className="border-amber-500/20">
        <div className="flex items-start gap-3 text-sm text-amber-100">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <p>
            The Governor allowlist and Treasury spending policies are mandatory on-chain checks.
            This report is advisory, reads current state, and does not simulate execution or
            guarantee that a proposal will execute successfully in the future.
          </p>
        </div>
      </Card>

      {proposalsError && (
        <p role="alert" className="text-sm text-rose-300">Proposal loading failed: {proposalsError}</p>
      )}

      {allProposals.length > 0 && (
        <label className="block max-w-3xl text-xs text-slate-300">
          Proposal
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"
          >
            {allProposals.map((proposal) => (
              <option key={proposal.proposalId} value={proposal.proposalId}>
                #{proposal.proposalId} — {proposal.title || 'Untitled proposal'}
              </option>
            ))}
          </select>
        </label>
      )}

      {proposalsLoading && <p className="text-sm text-slate-400">Loading proposals from the local chain…</p>}
      {loading && <p className="text-sm text-slate-400">Reading allowlists and Treasury policies…</p>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}

      {!proposalsLoading && allProposals.length === 0 && (
        <Card title="No on-chain proposals" subtitle="Risk analysis appears after a proposal is recorded on the active chain.">
          <p className="text-sm text-slate-400">No proposal data is fabricated or substituted here.</p>
        </Card>
      )}

      <div className="space-y-4">
        {assessment.map((item) => (
          <Card
            key={`${selectedId}-${item.index}`}
            title={`Action ${item.index + 1}: ${item.operation}`}
            subtitle={`Target ${shortenAddress(item.target, 6)} • selector ${item.selector}`}
            action={item.permittedByCurrentGuardrails ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Current checks pass
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-rose-300">
                <AlertTriangle className="h-4 w-4" /> Blocked by current checks
              </span>
            )}
          >
            <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
              <p>Target: <span className="font-mono text-slate-100">{item.target}</span></p>
              <p>Operation: <span className="text-slate-100">{item.operation}</span></p>
              <p>Asset amount: <span className="text-slate-100">{item.amount || 'Not an asset transfer'}</span></p>
              <p>Destination: <span className="font-mono text-slate-100">{item.recipient || 'N/A'}</span></p>
              <p>Destination approved: <span className="text-slate-100">
                {item.destinationApproved === null ? 'Not applicable' : item.destinationApproved ? 'Yes' : 'No'}
              </span></p>
            </div>

            <ul className="mt-4 space-y-1.5 text-xs">
              {item.checks.map((check) => (
                <li key={check.label} className={check.passed ? 'text-emerald-300' : 'text-rose-300'}>
                  {check.passed ? 'PASS' : 'FAIL'} — {check.label}
                </li>
              ))}
            </ul>
            {item.warnings.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-amber-300">
                {item.warnings.map((warning) => <li key={warning}>Advisory — {warning}</li>)}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
