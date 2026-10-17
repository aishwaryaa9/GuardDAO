import React, { useState } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input, Textarea } from '../components/common/Input';
import { ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import { useToast } from '../context/ToastContext';
import { getContractAddresses, CONTRACT_ABIS } from '../config/contracts';
import { getGovernorContract, submitProposal } from '../services/contracts';
import { cacheProposalLocally } from '../services/proposalIndexer';
import { parseContractError } from '../utils/errors';
import { formatTokens, formatEther, parseEtherSafely } from '../utils/formatters';
import { getJsonRpcProvider } from '../services/provider';
import {
  PlusCircle,
  FileText,
  Vault,
  Code2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Eye,
} from 'lucide-react';

export function CreateProposal({ governanceData, onProposalCreated, onNavigate }) {
  const { signer, address, isConnected, isCorrectNetwork } = useWeb3();
  const { addToast, updateToast } = useToast();
  const { token, governor } = governanceData;

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [actionType, setActionType] = useState('TREASURY_ETH'); // 'TREASURY_ETH' | 'TREASURY_TOKEN' | 'CUSTOM'

  // Treasury ETH fields
  const [recipient, setRecipient] = useState('');
  const [amountEth, setAmountEth] = useState('');
  const [reason, setReason] = useState('');

  // Custom call fields
  const [customTarget, setCustomTarget] = useState('');
  const [customCalldata, setCustomCalldata] = useState('0x');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Proposal threshold check
  const threshold = governor?.proposalThreshold || 1000000000000000000n;
  const userVotingPower = token?.userVotingPower || 0n;
  const hasThreshold = userVotingPower >= threshold;

  // Build full description text
  const fullDescription = `${title.trim()}\n\n${description.trim()}`;

  // Encoded parameters preview
  const addresses = getContractAddresses();
  const treasuryInterface = new ethers.Interface(CONTRACT_ABIS.Treasury);

  let encodedTarget = '';
  let encodedValue = 0n;
  let encodedCalldata = '0x';
  let encodingError = '';

  try {
    if (actionType === 'TREASURY_ETH') {
      encodedTarget = addresses.Treasury;
      encodedValue = 0n;
      if (recipient && ethers.isAddress(recipient)) {
        const valWei = parseEtherSafely(amountEth);
        encodedCalldata = treasuryInterface.encodeFunctionData('disburseEth', [
          recipient.trim(),
          valWei,
          reason.trim() || 'Treasury grant',
        ]);
      } else {
        encodedCalldata = '0x';
      }
    } else if (actionType === 'TREASURY_TOKEN') {
      encodedTarget = addresses.Treasury;
      encodedValue = 0n;
      if (recipient && ethers.isAddress(recipient)) {
        const valWei = parseEtherSafely(amountEth);
        encodedCalldata = treasuryInterface.encodeFunctionData('disburseToken', [
          addresses.GovernanceToken,
          recipient.trim(),
          valWei,
          reason.trim() || 'Treasury token grant',
        ]);
      } else {
        encodedCalldata = '0x';
      }
    } else {
      encodedTarget = customTarget.trim();
      encodedValue = 0n;
      encodedCalldata = customCalldata.trim() || '0x';
    }
  } catch (err) {
    encodingError = err.message;
  }

  // Validate form
  const validateForm = () => {
    if (!title.trim()) return 'Proposal title is required.';
    if (!description.trim()) return 'Proposal description is required.';

    if (actionType === 'TREASURY_ETH' || actionType === 'TREASURY_TOKEN') {
      if (!recipient || !ethers.isAddress(recipient.trim())) {
        return 'Please provide a valid Ethereum recipient address.';
      }
      if (!amountEth || Number(amountEth) <= 0) {
        return 'Please enter a valid transfer amount greater than 0.';
      }
    } else {
      if (!customTarget || !ethers.isAddress(customTarget.trim())) {
        return 'Please provide a valid target contract address.';
      }
      if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(customCalldata.trim()) || customCalldata.trim().length < 10) {
        return 'Calldata must contain a 4-byte function selector and valid hex data.';
      }
    }

    if (encodingError) return `Encoding error: ${encodingError}`;

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isConnected) {
      addToast({
        title: 'Wallet Required',
        message: 'Please connect MetaMask to submit a proposal.',
        type: 'error',
      });
      return;
    }

    if (!hasThreshold) {
      addToast({
        title: 'Insufficient Voting Power',
        message: `You need at least ${formatTokens(threshold)} delegated GOV voting power to propose. Current: ${formatTokens(userVotingPower)} GOV.`,
        type: 'error',
      });
      return;
    }

    if (!isCorrectNetwork) {
      addToast({
        title: 'Incorrect Network',
        message: 'Switch MetaMask to Hardhat Local (chain 31337) before submitting a proposal.',
        type: 'error',
      });
      return;
    }

    const validationMsg = validateForm();
    if (validationMsg) {
      addToast({
        title: 'Validation Error',
        message: validationMsg,
        type: 'error',
      });
      return;
    }

    setIsSubmitting(true);
    const toastId = addToast({
      title: 'Creating Proposal...',
      message: 'Submitting proposal transaction to DAOGovernor...',
      type: 'pending',
    });

    try {
      if (actionType === 'CUSTOM') {
        const selector = encodedCalldata.slice(0, 10);
        const allowed = await getGovernorContract(getJsonRpcProvider()).allowedCalls(
          encodedTarget,
          selector
        );
        if (!allowed) {
          throw new Error(`Function selector ${selector} is not currently allowlisted by GuardDAO governance.`);
        }
      }

      const targets = [encodedTarget];
      const values = [encodedValue];
      const calldatas = [encodedCalldata];

      const { receipt, proposalId } = await submitProposal(
        signer,
        targets,
        values,
        calldatas,
        fullDescription
      );

      // Cache locally for instant UX
      cacheProposalLocally({
        proposalId,
        proposer: address,
        targets,
        values,
        calldatas,
        description: fullDescription,
        voteStart: 0n,
        voteEnd: 0n,
      });

      updateToast(toastId, {
        title: 'Proposal Created Successfully!',
        message: `Proposal #${proposalId.slice(0, 8)}... has been submitted to the blockchain.`,
        type: 'success',
        txHash: receipt.hash,
      });

      if (onProposalCreated) onProposalCreated();
      onNavigate('proposals');
    } catch (err) {
      const parsed = parseContractError(err);
      updateToast(toastId, {
        title: 'Proposal Creation Failed',
        message: parsed,
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-white tracking-tight">Create Governance Proposal</h1>
        <p className="text-xs text-slate-400 mt-1">
          Encode executable contract calls to spend treasury funds or modify protocol parameters.
        </p>
      </div>

      {/* Threshold Warning Banner */}
      {!hasThreshold && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-100">Proposal Threshold Requirement</p>
            <p className="text-amber-300/80 leading-relaxed">
              DAOGovernor requires a minimum delegated voting power of{' '}
              <span className="font-mono font-bold text-amber-200">{formatTokens(threshold)} GOV</span> to submit a proposal.
              Your current voting power is{' '}
              <span className="font-mono font-bold text-amber-200">{formatTokens(userVotingPower)} GOV</span>.
            </p>
            <div className="pt-2">
              <Button size="sm" variant="secondary" onClick={() => onNavigate('token')}>
                Delegate Voting Power
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card title="1. Proposal Information" subtitle="Provide context and rationale for the DAO vote">
          <div className="space-y-4">
            <Input
              label="Proposal Title"
              placeholder="e.g. Proposal #2: Fund Ecosystem Developer Grants"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            <Textarea
              label="Detailed Description & Motivation"
              placeholder="Describe what this proposal accomplishes, why the DAO should approve it, and link relevant discussions..."
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
        </Card>

        {/* Action Selection */}
        <Card title="2. Executable Action" subtitle="Select what on-chain operation this proposal will execute upon passing">
          <div className="space-y-5">
            {/* Action Type Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setActionType('TREASURY_ETH')}
                className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all ${
                  actionType === 'TREASURY_ETH'
                    ? 'bg-indigo-600/15 border-indigo-500 text-indigo-300 ring-1 ring-indigo-500/50'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Vault className="w-5 h-5 mb-1.5" />
                <span className="text-xs font-bold">Treasury ETH Transfer</span>
                <span className="text-[10px] opacity-75 mt-0.5">Send ETH to recipient</span>
              </button>

              <button
                type="button"
                onClick={() => setActionType('TREASURY_TOKEN')}
                className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all ${
                  actionType === 'TREASURY_TOKEN'
                    ? 'bg-indigo-600/15 border-indigo-500 text-indigo-300 ring-1 ring-indigo-500/50'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Vault className="w-5 h-5 mb-1.5" />
                <span className="text-xs font-bold">Treasury GOV Transfer</span>
                <span className="text-[10px] opacity-75 mt-0.5">Disburse GOV tokens</span>
              </button>

              <button
                type="button"
                onClick={() => setActionType('CUSTOM')}
                className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all ${
                  actionType === 'CUSTOM'
                    ? 'bg-indigo-600/15 border-indigo-500 text-indigo-300 ring-1 ring-indigo-500/50'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code2 className="w-5 h-5 mb-1.5" />
                <span className="text-xs font-bold">Custom Contract Call</span>
                <span className="text-[10px] opacity-75 mt-0.5">Governance-allowlisted calls only</span>
              </button>
            </div>

            {/* Treasury Transfer Fields */}
            {(actionType === 'TREASURY_ETH' || actionType === 'TREASURY_TOKEN') && (
              <div className="space-y-4 pt-2">
                <Input
                  label="Recipient Address"
                  placeholder="0x..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  helperText="Address that will receive treasury funds after execution."
                  required
                />

                <Input
                  label={`Transfer Amount (${actionType === 'TREASURY_ETH' ? 'ETH' : 'GOV'})`}
                  type="number"
                  step="any"
                  placeholder="e.g. 2.5"
                  value={amountEth}
                  onChange={(e) => setAmountEth(e.target.value)}
                  suffix={actionType === 'TREASURY_ETH' ? 'ETH' : 'GOV'}
                  required
                />

                <Input
                  label="Disbursal Reason (Audit Trail)"
                  placeholder="e.g. Grant for Q3 Community Hackathon"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  helperText="Emitted in the on-chain EthDisbursed event."
                />
              </div>
            )}

            {/* Custom Call Fields */}
            {actionType === 'CUSTOM' && (
              <div className="space-y-4 pt-2">
                <Input
                  label="Target Contract Address"
                  placeholder="0x..."
                  value={customTarget}
                  onChange={(e) => setCustomTarget(e.target.value)}
                  required
                />

                <Textarea
                  label="Calldata (Hex string)"
                  placeholder="0x..."
                  rows={3}
                  value={customCalldata}
                  onChange={(e) => setCustomCalldata(e.target.value)}
                  required
                />
                <p className="text-xs text-slate-400">
                  The Governor requires zero attached ETH and an allowlisted target/function selector.
                  The current allowlist is checked before your wallet is prompted.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Action Review & Calldata Preview */}
        <Card
          title="3. Review Encoded Action"
          subtitle="Verify the exact calldata that DAOGovernor will submit to the Timelock"
        >
          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-slate-400">
                <span>Target Contract:</span>
                <span className="font-mono text-slate-200">{encodedTarget || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>ETH Value:</span>
                <span className="font-mono text-slate-200">{formatEther(encodedValue)} ETH</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Encoded Calldata:</span>
                <div className="p-2 rounded bg-slate-950 border border-slate-800 font-mono text-[11px] text-indigo-300 break-all select-all max-h-24 overflow-y-auto">
                  {encodedCalldata}
                </div>
              </div>
            </div>

            {encodingError && (
              <p className="text-rose-400 text-xs">Encoding error: {encodingError}</p>
            )}
          </div>
        </Card>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onNavigate('proposals')}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSubmitting}
            disabled={!isConnected || !isCorrectNetwork || !hasThreshold}
          >
            Submit Proposal
          </Button>
        </div>
      </form>
    </div>
  );
}
