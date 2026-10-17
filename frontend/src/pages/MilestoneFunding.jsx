import React, { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { EvidenceManager } from '../components/milestones/EvidenceManager';
import { submitMilestoneEvidence } from '../services/evidenceService';
import { useToast } from '../context/ToastContext';
import { useWeb3 } from '../context/Web3Context';
import {
  getGovernorContract,
  getMilestoneEscrowContract,
  getReputationContract,
  getTreasuryContract,
} from '../services/contracts';
import { getJsonRpcProvider } from '../services/provider';
import { getContractAddresses } from '../config/contracts';
import { parseContractError } from '../utils/errors';
import { formatEther, formatTimestamp, shortenAddress } from '../utils/formatters';

const PLAN_STATES = ['Funded', 'Completed', 'Cancelled'];
const MILESTONE_STATES = ['Pending', 'Submitted', 'Approved', 'Rejected', 'Released', 'Refunded'];

function parseCsv(value, fieldName) {
  const entries = value.split(',').map((entry) => entry.trim());
  if (entries.length === 0 || entries.some((entry) => entry.length === 0)) {
    throw new Error(`${fieldName} must be a comma-separated list.`);
  }
  return entries;
}

export function MilestoneFunding({ onRefresh }) {
  const { address, signer, isConnected, isCorrectNetwork, rpcStatus } = useWeb3();
  const { addToast, updateToast } = useToast();
  const [plans, setPlans] = useState([]);
  const [bootstrap, setBootstrap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({
    title: '',
    recipient: '',
    reviewer: '',
    amounts: '0.25, 0.25',
    deadlineDays: '7, 14',
    reviewHours: '72',
  });
  const [busyKey, setBusyKey] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const addresses = getContractAddresses();
      const escrow = getMilestoneEscrowContract(getJsonRpcProvider());
      const treasury = getTreasuryContract(getJsonRpcProvider());
      const reputation = getReputationContract(getJsonRpcProvider());
      const [planCount, escrowRecipientApproved, reputationAddress, awarderRole] = await Promise.all([
        escrow.planCount(),
        treasury.approvedRecipients(addresses.MilestoneEscrow),
        escrow.reputation(),
        reputation.AWARDER_ROLE(),
      ]);
      const reputationConfigured = reputationAddress.toLowerCase() === addresses.DAOReputation.toLowerCase();
      const awarderConfigured = await reputation.hasRole(awarderRole, addresses.MilestoneEscrow);
      setBootstrap({
        escrowRecipientApproved,
        reputationConfigured,
        awarderConfigured,
      });

      const total = Number(planCount);
      const start = Math.max(0, total - 20);
      const ids = await Promise.all(
        Array.from({ length: total - start }, (_, offset) => escrow.planIdAt(start + offset))
      );
      const loaded = await Promise.all(ids.map(async (id) => {
        const plan = await escrow.getPlan(id);
        const milestones = await Promise.all(
          Array.from({ length: Number(plan.milestoneCount) }, (_, index) =>
            escrow.getMilestone(id, index))
        );
        return { id, plan, milestones };
      }));
      setPlans(loaded.reverse());
    } catch (error) {
      setLoadError(error.message || 'Could not load milestone contracts from the active local chain.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, rpcStatus.blockNumber]);

  const runTransaction = async (key, title, operation) => {
    if (!signer || !isConnected || !isCorrectNetwork) {
      addToast({
        title: 'Wallet/network required',
        message: 'Connect a wallet on Hardhat Local (chain 31337) before submitting this action.',
        type: 'error',
      });
      return;
    }

    setBusyKey(key);
    const toastId = addToast({ title, message: 'Waiting for wallet confirmation…', type: 'pending' });
    try {
      const transaction = await operation();
      const receipt = await transaction.wait();
      if (receipt.status !== 1) throw new Error(`Transaction ${transaction.hash} was not successful.`);
      updateToast(toastId, {
        title: 'Transaction confirmed',
        message: 'The confirmed local-chain state is being refreshed.',
        txHash: receipt.hash,
        type: 'success',
      });
      await refresh();
      if (onRefresh) await onRefresh();
      return receipt;
    } catch (error) {
      updateToast(toastId, {
        title: 'Transaction failed',
        message: parseContractError(error),
        type: 'error',
      });
      return null;
    } finally {
      setBusyKey('');
    }
  };

  const proposeEscrowSetup = async () => {
    const addresses = getContractAddresses();
    await runTransaction('bootstrap', 'Submitting escrow setup proposal', async () => {
      const treasury = getTreasuryContract(signer);
      const escrow = getMilestoneEscrowContract(signer);
      const reputation = getReputationContract(signer);
      const targets = [];
      const values = [];
      const calldatas = [];

      if (!bootstrap?.escrowRecipientApproved) {
        targets.push(addresses.Treasury);
        values.push(0);
        calldatas.push(treasury.interface.encodeFunctionData('setRecipientAllowed', [
          addresses.MilestoneEscrow,
          true,
        ]));
      }
      if (!bootstrap?.reputationConfigured) {
        targets.push(addresses.MilestoneEscrow);
        values.push(0);
        calldatas.push(escrow.interface.encodeFunctionData('setReputation', [
          addresses.DAOReputation,
        ]));
      }
      if (!bootstrap?.awarderConfigured) {
        targets.push(addresses.DAOReputation);
        values.push(0);
        calldatas.push(reputation.interface.encodeFunctionData('grantRole', [
          await reputation.AWARDER_ROLE(),
          addresses.MilestoneEscrow,
        ]));
      }
      if (targets.length === 0) throw new Error('Escrow setup is already complete.');

      return getGovernorContract(signer).propose(
        targets,
        values,
        calldatas,
        'GuardDAO: authorize Treasury-funded milestone escrow and reputation awards'
      );
    });
  };

  const submitFundingProposal = async (event) => {
    event.preventDefault();
    let amounts;
    let days;
    let recipient;
    let reviewer;
    try {
      if (!form.title.trim()) throw new Error('Enter a plan title.');
      recipient = ethers.getAddress(form.recipient.trim());
      reviewer = ethers.getAddress(form.reviewer.trim());
      if (recipient === reviewer) throw new Error('Reviewer and recipient must be different addresses.');
      const amountInputs = parseCsv(form.amounts, 'Milestone amounts');
      const dayInputs = parseCsv(form.deadlineDays, 'Deadline days');
      if (amountInputs.length !== dayInputs.length || amountInputs.length > 20) {
        throw new Error('Enter matching amount and deadline lists (maximum 20 milestones).');
      }
      amounts = amountInputs.map((value) => {
        if (!/^(?:\d+)(?:\.\d{1,18})?$/.test(value)) throw new Error('Each ETH amount must be a valid positive decimal.');
        const wei = ethers.parseEther(value);
        if (wei <= 0n) throw new Error('Milestone amounts must be greater than zero.');
        return wei;
      });
      days = dayInputs.map((value) => {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3650) {
          throw new Error('Deadline offsets must be whole days from 1 to 3650.');
        }
        return parsed;
      });
      if (!signer || !address) throw new Error('Connect a wallet before creating a funding proposal.');
      if (!isCorrectNetwork) throw new Error('Switch MetaMask to Hardhat Local (chain 31337).');
      if (amounts.reduce((sum, amount) => sum + amount, 0n) <= 0n) {
        throw new Error('The total plan amount must be greater than zero.');
      }
    } catch (error) {
      addToast({ title: 'Invalid funding plan', message: error.message, type: 'error' });
      return;
    }

    const addresses = getContractAddresses();
    await runTransaction('create-plan', 'Submitting milestone funding proposal', async () => {
      const provider = signer.provider;
      const treasury = getTreasuryContract(provider);
      const escrow = getMilestoneEscrowContract(provider);
      const governor = getGovernorContract(signer);
      const total = amounts.reduce((sum, amount) => sum + amount, 0n);
      const spendCheck = Number(await treasury.checkSpend(
        ethers.ZeroAddress,
        addresses.MilestoneEscrow,
        total
      ));
      if (spendCheck !== 0) {
        throw new Error(`Treasury policy blocks escrow funding (policy check ${spendCheck}). Approve the escrow recipient and ensure the plan is within current spend limits.`);
      }
      if (!bootstrap?.reputationConfigured || !bootstrap?.awarderConfigured) {
        throw new Error('First submit and pass the escrow setup proposal before funding plans.');
      }

      const deadlineOffsets = days.map((day) => BigInt(day * 86400));
      for (let i = 1; i < deadlineOffsets.length; i += 1) {
        if (deadlineOffsets[i] <= deadlineOffsets[i - 1]) {
          throw new Error('Milestone deadline offsets must be strictly increasing.');
        }
      }
      const planId = ethers.id(`${address}:${Date.now()}:${form.title.trim()}`);
      const config = {
        planId,
        title: form.title.trim(),
        recipient,
        reviewer,
        fundingAmount: total,
        reviewPeriod: BigInt(Math.ceil(Number(form.reviewHours) * 3600)),
        milestoneAmounts: amounts,
        submissionDeadlineOffsets: deadlineOffsets,
      };
      if (!Number.isFinite(Number(form.reviewHours))
        || Number(form.reviewHours) < 1
        || Number(form.reviewHours) > 8760) {
        throw new Error('Review period must be between 1 and 8760 hours.');
      }

      const fundingCall = treasury.interface.encodeFunctionData('disburseEth', [
        addresses.MilestoneEscrow,
        total,
        `Funding plan ${planId}`,
      ]);
      const createPlanCall = escrow.interface.encodeFunctionData('createPlan', [config]);
      return governor.propose(
        [addresses.Treasury, addresses.MilestoneEscrow],
        [0, 0],
        [fundingCall, createPlanCall],
        `GuardDAO milestone funding: ${form.title.trim()}`
      );
    });
  };

  const cancelPlan = (planId) => runTransaction(`cancel-${planId}`, 'Submitting plan cancellation proposal', async () => (
    getGovernorContract(signer).propose(
      [getContractAddresses().MilestoneEscrow],
      [0],
      [getMilestoneEscrowContract(signer).interface.encodeFunctionData('cancelPlan', [planId])],
      `GuardDAO: cancel milestone plan ${planId}`
    )
  ));

  const milestoneAction = (planId, index, action, operation) =>
    runTransaction(`${action}-${planId}-${index}`, `${action} milestone`, operation);

  const submitEvidence = (planId, index, reference) => milestoneAction(
    planId,
    index,
    'Submit evidence for',
    () => submitMilestoneEvidence(
      getMilestoneEscrowContract(signer),
      planId,
      index,
      reference
    )
  );

  const plansTotals = plans.reduce((totals, item) => ({
    funded: totals.funded + BigInt(item.plan.fundingAmount),
    released: totals.released + BigInt(item.plan.releasedAmount),
    remaining: totals.remaining + BigInt(item.plan.fundingAmount)
      - BigInt(item.plan.releasedAmount) - BigInt(item.plan.refundedAmount),
  }), { funded: 0n, released: 0n, remaining: 0n });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Milestone Funding</h1>
          <p className="mt-1 text-sm text-slate-400">
            Treasury funds are committed by a Governor + Timelock proposal and released in approved stages.
          </p>
        </div>
        <Button variant="outline" onClick={refresh} icon={RefreshCw} disabled={loading}>Refresh plans</Button>
      </div>

      <Card className="border-amber-500/20">
        <div className="flex items-start gap-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <p>
            Evidence is stored off-chain. Public IPFS content may be discoverable and is not guaranteed to remain available;
            do not upload confidential documents. A matching SHA-256 digest verifies file integrity, not truthfulness or completed work.
            Reviewers remain trusted decision-makers.
          </p>
        </div>
      </Card>

      {bootstrap && (!bootstrap.escrowRecipientApproved
        || !bootstrap.reputationConfigured
        || !bootstrap.awarderConfigured) && (
        <Card
          title="Governance setup required"
          subtitle="These permissions are not granted by the frontend directly. Submit a proposal and wait for the configured vote and Timelock delay."
          action={(
            <Button
              size="sm"
              onClick={proposeEscrowSetup}
              isLoading={busyKey === 'bootstrap'}
              disabled={!isConnected || !isCorrectNetwork || busyKey !== ''}
            >
              Propose secure escrow setup
            </Button>
          )}
        >
          <ul className="space-y-1 text-xs text-slate-300">
            <li>Treasury payout recipient: {bootstrap.escrowRecipientApproved ? 'approved' : 'not approved'}</li>
            <li>Reputation registry: {bootstrap.reputationConfigured ? 'configured' : 'not configured'}</li>
            <li>Escrow awarder role: {bootstrap.awarderConfigured ? 'configured' : 'not configured'}</li>
          </ul>
        </Card>
      )}

      {loadError && <p role="alert" className="text-sm text-rose-300">{loadError}</p>}
      {loading && <p className="text-sm text-slate-400">Loading on-chain escrow plans…</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Recent funded total"><p className="font-mono text-2xl text-white">{formatEther(plansTotals.funded)} ETH</p></Card>
        <Card title="Released total"><p className="font-mono text-2xl text-emerald-300">{formatEther(plansTotals.released)} ETH</p></Card>
        <Card title="Remaining / refundable"><p className="font-mono text-2xl text-indigo-300">{formatEther(plansTotals.remaining)} ETH</p></Card>
      </div>

      <Card title="Propose a funding plan" subtitle="This creates a Governor proposal; it does not immediately transfer funds.">
        <form onSubmit={submitFundingProposal} className="grid gap-4 md:grid-cols-2">
          <Input label="Plan title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={128} required />
          <Input label="Recipient wallet" value={form.recipient} onChange={(event) => setForm({ ...form, recipient: event.target.value })} placeholder="0x…" required />
          <Input label="Independent reviewer wallet" value={form.reviewer} onChange={(event) => setForm({ ...form, reviewer: event.target.value })} placeholder="0x…" required />
          <Input label="Review period (hours)" type="number" min="1" max="8760" value={form.reviewHours} onChange={(event) => setForm({ ...form, reviewHours: event.target.value })} required />
          <Input label="Milestone amounts (ETH, comma-separated)" value={form.amounts} onChange={(event) => setForm({ ...form, amounts: event.target.value })} helperText="Each amount is transferred only after its milestone is approved." required />
          <Input label="Submission deadlines (days from now, comma-separated)" value={form.deadlineDays} onChange={(event) => setForm({ ...form, deadlineDays: event.target.value })} helperText="Use one increasing deadline offset per milestone." required />
          <div className="md:col-span-2">
            <Button type="submit" isLoading={busyKey === 'create-plan'} disabled={!isConnected || !isCorrectNetwork || busyKey !== ''}>
              Submit governance funding proposal
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        {plans.length === 0 && !loading && (
          <Card title="No funded plans yet"><p className="text-sm text-slate-400">Plans appear after a funding proposal passes and is executed through the Timelock.</p></Card>
        )}
        {plans.map(({ id, plan, milestones }) => (
          <Card
            key={id}
            title={plan.title}
            subtitle={`Plan ${id} • ${PLAN_STATES[Number(plan.state)]}`}
            action={plan.state === 0 ? (
              <Button size="sm" variant="outline" onClick={() => cancelPlan(id)} disabled={!isConnected || !isCorrectNetwork || busyKey !== ''}>
                Propose cancellation
              </Button>
            ) : null}
          >
            <div className="mb-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
              <p>Recipient: <span className="font-mono">{shortenAddress(plan.recipient, 6)}</span></p>
              <p>Reviewer: <span className="font-mono">{shortenAddress(plan.reviewer, 6)}</span></p>
              <p>Total approved: {formatEther(plan.fundingAmount)} ETH</p>
              <p>Released: {formatEther(plan.releasedAmount)} ETH · Refunded: {formatEther(plan.refundedAmount)} ETH</p>
            </div>
            <div className="space-y-3">
              {milestones.map((milestone, index) => {
                const state = Number(milestone.state);
                const isRecipient = address?.toLowerCase() === plan.recipient.toLowerCase();
                const isReviewer = address?.toLowerCase() === plan.reviewer.toLowerCase();
                const currentTimestamp = Math.floor(Date.now() / 1000);
                const refundable = state === 3
                  || (state === 0 && currentTimestamp > Number(milestone.submissionDeadline))
                  || (state === 1 && currentTimestamp > Number(milestone.reviewDeadline))
                  || Number(plan.state) === 2;
                const actionKey = `${id}-${index}`;
                return (
                  <div key={actionKey} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-white">Milestone {index + 1} · {formatEther(milestone.amount)} ETH</p>
                      <span className="text-xs text-indigo-300">{MILESTONE_STATES[state]}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Submission deadline: {formatTimestamp(milestone.submissionDeadline)}</p>
                    {(Boolean(milestone.evidenceReference) || (state === 0 && Number(plan.state) === 0)) && (
                      <EvidenceManager
                        key={actionKey}
                        planId={id}
                        milestoneIndex={index}
                        evidenceReference={milestone.evidenceReference}
                        isSubmitted={Boolean(milestone.evidenceReference)}
                        isRecipient={isRecipient}
                        isConnected={isConnected}
                        isCorrectNetwork={isCorrectNetwork}
                        isSubmitting={busyKey === `Submit evidence for-${id}-${index}`}
                        onSubmitEvidence={submitEvidence}
                      />
                    )}
                    {state === 1 && isReviewer && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="success" onClick={() => milestoneAction(id, index, 'Approve', () => getMilestoneEscrowContract(signer).approveMilestone(id, index))} disabled={busyKey !== ''}>
                          Approve milestone
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => milestoneAction(id, index, 'Reject', () => getMilestoneEscrowContract(signer).rejectMilestone(id, index, 'Reviewer rejected submitted evidence'))} disabled={busyKey !== ''}>
                          Reject milestone
                        </Button>
                      </div>
                    )}
                    {state === 2 && (
                      <Button size="sm" className="mt-3" onClick={() => milestoneAction(id, index, 'Release', () => getMilestoneEscrowContract(signer).releaseMilestone(id, index))} disabled={busyKey !== ''}>
                        Release approved allocation
                      </Button>
                    )}
                    {refundable && state !== 2 && state !== 4 && state !== 5 && (
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => milestoneAction(id, index, 'Refund', () => getMilestoneEscrowContract(signer).refundMilestone(id, index))} disabled={busyKey !== ''}>
                        Return allocation to Treasury
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
