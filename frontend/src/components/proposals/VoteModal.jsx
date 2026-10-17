import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Textarea } from '../common/Input';
import { formatTokens } from '../../utils/formatters';
import { castProposalVote } from '../../services/contracts';
import { useWeb3 } from '../../context/Web3Context';
import { useToast } from '../../context/ToastContext';
import { parseContractError } from '../../utils/errors';
import { VoteType } from '../../utils/constants';
import { ThumbsUp, ThumbsDown, MinusCircle, AlertTriangle } from 'lucide-react';

export function VoteModal({ isOpen, onClose, proposal, onSuccess }) {
  const { signer, isConnected } = useWeb3();
  const { addToast, updateToast } = useToast();

  const [selectedVote, setSelectedVote] = useState(VoteType.For);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!proposal) return null;

  const votingPower = proposal.userVotingPowerAtSnapshot || 0n;
  const hasZeroPower = votingPower === 0n;
  const hasAlreadyVoted = proposal.hasVoted;

  const handleSubmitVote = async () => {
    if (!signer) {
      addToast({
        title: 'Wallet Not Connected',
        message: 'Please connect your wallet to cast a vote.',
        type: 'error',
      });
      return;
    }

    setSubmitting(true);
    const toastId = addToast({
      title: 'Submitting Vote...',
      message: `Casting ${selectedVote === VoteType.For ? 'FOR' : selectedVote === VoteType.Against ? 'AGAINST' : 'ABSTAIN'} vote on Proposal #${proposal.proposalId.slice(0, 8)}...`,
      type: 'pending',
    });

    try {
      const receipt = await castProposalVote(
        signer,
        BigInt(proposal.proposalId),
        selectedVote,
        reason
      );

      updateToast(toastId, {
        title: 'Vote Cast Successfully',
        message: `Your vote of ${formatTokens(votingPower)} GOV has been recorded on-chain.`,
        type: 'success',
        txHash: receipt.hash,
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      const parsed = parseContractError(err);
      updateToast(toastId, {
        title: 'Vote Failed',
        message: parsed,
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cast Your Vote"
      subtitle={`Proposal: ${proposal.title || `#${proposal.proposalId}`}`}
    >
      <div className="space-y-5">
        {/* Voting Power Banner */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-xs text-slate-400">Your Voting Power at Snapshot:</span>
          <span className="text-sm font-semibold text-indigo-400 font-mono">
            {formatTokens(votingPower)} GOV
          </span>
        </div>

        {hasZeroPower && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="font-medium">No Voting Power at Snapshot</p>
              <p className="mt-0.5 text-amber-400/80">
                You held 0 delegated GOV tokens when this proposal reached its snapshot block. You cannot influence the outcome of this proposal.
              </p>
            </div>
          </div>
        )}

        {hasAlreadyVoted && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" />
            <div>
              <p className="font-medium">Already Voted</p>
              <p className="mt-0.5 text-indigo-400/80">
                Our records indicate your wallet has already cast a vote on this proposal.
              </p>
            </div>
          </div>
        )}

        {/* Voting Options */}
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setSelectedVote(VoteType.For)}
            className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all ${
              selectedVote === VoteType.For
                ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/50 shadow-lg shadow-emerald-500/10'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <ThumbsUp className="w-5 h-5 mb-1.5" />
            <span className="text-sm font-bold">For</span>
            <span className="text-[10px] opacity-75 mt-0.5">Vote in favor</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedVote(VoteType.Against)}
            className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all ${
              selectedVote === VoteType.Against
                ? 'bg-rose-500/15 border-rose-500 text-rose-300 ring-1 ring-rose-500/50 shadow-lg shadow-rose-500/10'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <ThumbsDown className="w-5 h-5 mb-1.5" />
            <span className="text-sm font-bold">Against</span>
            <span className="text-[10px] opacity-75 mt-0.5">Vote against</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedVote(VoteType.Abstain)}
            className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all ${
              selectedVote === VoteType.Abstain
                ? 'bg-slate-700/40 border-slate-500 text-slate-200 ring-1 ring-slate-500/50 shadow-lg'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <MinusCircle className="w-5 h-5 mb-1.5" />
            <span className="text-sm font-bold">Abstain</span>
            <span className="text-[10px] opacity-75 mt-0.5">Counts for quorum</span>
          </button>
        </div>

        {/* Optional Reason */}
        <Textarea
          label="Vote Reason (Optional)"
          placeholder="Explain the rationale behind your vote for the on-chain audit trail..."
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={submitting}
            disabled={!isConnected || hasZeroPower || hasAlreadyVoted}
            onClick={handleSubmitVote}
          >
            Confirm & Cast Vote
          </Button>
        </div>
      </div>
    </Modal>
  );
}
