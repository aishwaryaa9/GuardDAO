import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { ProposalStatusBadge } from './ProposalStatusBadge';
import { VoteBreakdown } from './VoteBreakdown';
import {
  shortenAddress,
  formatTokens,
  formatEther,
  formatTimestamp,
  formatBlocksToTime,
} from '../../utils/formatters';
import { ProposalState } from '../../utils/constants';
import { queueProposal, executeProposal } from '../../services/contracts';
import { useWeb3 } from '../../context/Web3Context';
import { useToast } from '../../context/ToastContext';
import { parseContractError } from '../../utils/errors';
import {
  Clock,
  User,
  Hash,
  ExternalLink,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Copy,
  AlertCircle,
} from 'lucide-react';

export function ProposalDetailsModal({
  isOpen,
  onClose,
  proposal,
  onOpenVote,
  onRefresh,
}) {
  const { signer, isConnected } = useWeb3();
  const { addToast, updateToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!proposal) return null;

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
  const secondsUntilEta = Math.max(etaSeconds - nowSeconds, 0);

  const handleCopyId = () => {
    navigator.clipboard.writeText(proposal.proposalId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleQueue = async () => {
    if (!signer) return;
    setIsProcessing(true);
    const toastId = addToast({
      title: 'Queueing Proposal...',
      message: 'Submitting proposal to DAOTimelock Controller...',
      type: 'pending',
    });

    try {
      const receipt = await queueProposal(
        signer,
        proposal.targets,
        proposal.values,
        proposal.calldatas,
        proposal.description
      );

      updateToast(toastId, {
        title: 'Proposal Queued',
        message: 'Proposal successfully entered the Timelock queue.',
        type: 'success',
        txHash: receipt.hash,
      });

      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      updateToast(toastId, {
        title: 'Queue Failed',
        message: parseContractError(err),
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecute = async () => {
    if (!signer) return;
    setIsProcessing(true);
    const toastId = addToast({
      title: 'Executing Proposal...',
      message: 'Calling DAOGovernor.execute to trigger Timelock actions...',
      type: 'pending',
    });

    try {
      const receipt = await executeProposal(
        signer,
        proposal.targets,
        proposal.values,
        proposal.calldatas,
        proposal.description
      );

      updateToast(toastId, {
        title: 'Proposal Executed',
        message: 'On-chain operations executed successfully!',
        type: 'success',
        txHash: receipt.hash,
      });

      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      updateToast(toastId, {
        title: 'Execution Failed',
        message: parseContractError(err),
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={proposal.title || 'Proposal Details'}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
        {/* Header Badges */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ProposalStatusBadge state={proposal.state} />
            {proposal.hasVoted && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                You Voted
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Hash className="w-3.5 h-3.5" />
            <span>ID: {proposal.proposalId.slice(0, 10)}...</span>
            <button
              onClick={handleCopyId}
              className="p-1 hover:text-white transition-colors"
              title="Copy Proposal ID"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            {copied && <span className="text-[10px] text-emerald-400">Copied!</span>}
          </div>
        </div>

        {/* Proposer & Timing Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-500" />
              Proposer
            </span>
            <span className="font-mono text-slate-200 block truncate" title={proposal.proposer}>
              {proposal.proposer}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Voting Window
            </span>
            <span className="font-mono text-slate-200 block">
              Block {proposal.snapshot.toString()} → {proposal.deadline.toString()}
              {isActive && (
                <span className="text-indigo-400 text-[11px] ml-1">
                  ({formatBlocksToTime(blocksRemaining)} left)
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Voting Results */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Voting Distribution & Quorum
          </h4>
          <VoteBreakdown votes={proposal.votes} quorumNeeded={proposal.quorumNeeded} />
        </div>

        {/* Queued Timelock Status */}
        {isQueued && (
          <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-cyan-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                Timelock Execution Delay
              </span>
              <span className="font-mono text-cyan-400">
                ETA: {formatTimestamp(proposal.eta)}
              </span>
            </div>
            {!isEtaReached ? (
              <p className="text-xs text-slate-300">
                This proposal is queued in the Timelock. Execution will become available in approximately{' '}
                <span className="font-semibold text-cyan-300 font-mono">
                  {Math.floor(secondsUntilEta / 3600)}h {Math.floor((secondsUntilEta % 3600) / 60)}m
                </span>.
              </p>
            ) : (
              <p className="text-xs text-emerald-300 font-medium">
                The timelock delay has elapsed! Any account can now execute this proposal.
              </p>
            )}
          </div>
        )}

        {/* Description Section */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Description
          </h4>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
            {proposal.description || 'No description provided.'}
          </div>
        </div>

        {/* Encoded Actions */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            Executable Actions ({proposal.targets?.length || 0})
          </h4>

          {proposal.targets?.map((target, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="font-medium">Action #{idx + 1}</span>
                <span className="font-mono text-slate-300">Target: {shortenAddress(target, 6)}</span>
              </div>

              {proposal.decodedAction && idx === 0 && (
                <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs">
                  <span className="font-semibold block">Decoded Treasury Action:</span>
                  <span className="mt-0.5 block">{proposal.decodedAction.summary}</span>
                </div>
              )}

              <div className="space-y-1 text-[11px] font-mono text-slate-400">
                <div className="flex justify-between">
                  <span>ETH Value:</span>
                  <span className="text-slate-200">
                    {formatEther(proposal.values?.[idx] || 0n)} ETH
                  </span>
                </div>
                <div className="pt-1">
                  <span className="block text-[10px] text-slate-500">Calldata:</span>
                  <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80 break-all text-slate-400 select-all max-h-20 overflow-y-auto">
                    {proposal.calldatas?.[idx] || '0x'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>

          {isActive && (
            <Button
              variant="primary"
              disabled={proposal.hasVoted || proposal.userVotingPowerAtSnapshot === 0n}
              onClick={() => {
                onClose();
                onOpenVote(proposal);
              }}
            >
              {proposal.hasVoted ? 'Already Voted' : 'Cast Vote'}
            </Button>
          )}

          {isSucceeded && (
            <Button
              variant="success"
              isLoading={isProcessing}
              disabled={!isConnected}
              onClick={handleQueue}
            >
              Queue to Timelock
            </Button>
          )}

          {isQueued && (
            <Button
              variant="success"
              isLoading={isProcessing}
              disabled={!isConnected || !isEtaReached}
              onClick={handleExecute}
            >
              {isEtaReached ? 'Execute Proposal' : 'Timelock Pending'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
