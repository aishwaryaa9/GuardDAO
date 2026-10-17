import React, { useState } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import { useToast } from '../context/ToastContext';
import { delegateTokens, transferTokens } from '../services/contracts';
import { parseContractError } from '../utils/errors';
import {
  formatTokens,
  formatEther,
  shortenAddress,
  parseEtherSafely,
} from '../utils/formatters';
import { getContractAddresses } from '../config/contracts';
import {
  Coins,
  Vote,
  UserCheck,
  Send,
  Info,
  CheckCircle2,
  Copy,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

export function TokenDelegation({ governanceData, onRefresh }) {
  const { address, signer, isConnected } = useWeb3();
  const { addToast, updateToast } = useToast();
  const { token, addresses } = governanceData;

  const [customDelegate, setCustomDelegate] = useState('');
  const [isDelegatingSelf, setIsDelegatingSelf] = useState(false);
  const [isDelegatingCustom, setIsDelegatingCustom] = useState(false);

  // Transfer fields
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  const [copiedAddress, setCopiedAddress] = useState(false);

  const userBalance = token?.userBalance || 0n;
  const userVotingPower = token?.userVotingPower || 0n;
  const currentDelegate = token?.userDelegate || ethers.ZeroAddress;

  const isSelfDelegated =
    address && currentDelegate.toLowerCase() === address.toLowerCase();
  const hasNoDelegation =
    currentDelegate === ethers.ZeroAddress || currentDelegate === '0x0000000000000000000000000000000000000000';

  const handleCopyContract = () => {
    navigator.clipboard.writeText(addresses?.GovernanceToken || '');
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  // Self delegate
  const handleSelfDelegate = async () => {
    if (!signer || !address) return;
    setIsDelegatingSelf(true);
    const toastId = addToast({
      title: 'Submitting Delegation...',
      message: 'Self-delegating voting power to your address...',
      type: 'pending',
    });

    try {
      const receipt = await delegateTokens(signer, address);
      updateToast(toastId, {
        title: 'Delegation Successful!',
        message: 'Your tokens are now delegated to yourself, activating your voting power.',
        type: 'success',
        txHash: receipt.hash,
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      updateToast(toastId, {
        title: 'Delegation Failed',
        message: parseContractError(err),
        type: 'error',
      });
    } finally {
      setIsDelegatingSelf(false);
    }
  };

  // Custom delegate
  const handleCustomDelegate = async (e) => {
    e.preventDefault();
    if (!signer) return;

    if (!customDelegate || !ethers.isAddress(customDelegate.trim())) {
      addToast({
        title: 'Invalid Address',
        message: 'Please enter a valid Ethereum delegate address.',
        type: 'error',
      });
      return;
    }

    setIsDelegatingCustom(true);
    const toastId = addToast({
      title: 'Submitting Delegation...',
      message: `Delegating voting power to ${shortenAddress(customDelegate)}...`,
      type: 'pending',
    });

    try {
      const receipt = await delegateTokens(signer, customDelegate.trim());
      updateToast(toastId, {
        title: 'Delegation Successful!',
        message: `Voting power successfully delegated to ${shortenAddress(customDelegate)}.`,
        type: 'success',
        txHash: receipt.hash,
      });
      setCustomDelegate('');
      if (onRefresh) onRefresh();
    } catch (err) {
      updateToast(toastId, {
        title: 'Delegation Failed',
        message: parseContractError(err),
        type: 'error',
      });
    } finally {
      setIsDelegatingCustom(false);
    }
  };

  // Transfer tokens
  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!signer) return;

    if (!transferRecipient || !ethers.isAddress(transferRecipient.trim())) {
      addToast({
        title: 'Invalid Recipient',
        message: 'Please enter a valid recipient address.',
        type: 'error',
      });
      return;
    }

    const amountWei = parseEtherSafely(transferAmount);
    if (amountWei <= 0n) {
      addToast({
        title: 'Invalid Amount',
        message: 'Please enter an amount greater than 0.',
        type: 'error',
      });
      return;
    }

    if (amountWei > userBalance) {
      addToast({
        title: 'Insufficient Balance',
        message: `You only have ${formatTokens(userBalance)} GOV tokens.`,
        type: 'error',
      });
      return;
    }

    setIsTransferring(true);
    const toastId = addToast({
      title: 'Transferring Tokens...',
      message: `Sending ${transferAmount} GOV to ${shortenAddress(transferRecipient)}...`,
      type: 'pending',
    });

    try {
      const receipt = await transferTokens(signer, transferRecipient.trim(), amountWei);
      updateToast(toastId, {
        title: 'Transfer Successful!',
        message: `Sent ${transferAmount} GOV tokens successfully.`,
        type: 'success',
        txHash: receipt.hash,
      });
      setTransferRecipient('');
      setTransferAmount('');
      if (onRefresh) onRefresh();
    } catch (err) {
      updateToast(toastId, {
        title: 'Transfer Failed',
        message: parseContractError(err),
        type: 'error',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-white tracking-tight">Governance Token & Delegation</h1>
        <p className="text-xs text-slate-400 mt-1">
          Manage your ERC20Votes token balance, delegate voting weight, or assign representatives.
        </p>
      </div>

      {/* ERC20Votes Architecture Educational Callout */}
      <div className="flex items-start gap-3.5 p-4 sm:p-5 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 text-xs text-indigo-200">
        <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-1.5 leading-relaxed">
          <h3 className="font-semibold text-indigo-100 text-sm">
            How Voting Power Works (ERC20Votes Standard)
          </h3>
          <p className="text-indigo-200/90">
            In OpenZeppelin's ERC20Votes architecture, <strong>simply holding GOV tokens does not grant active voting power</strong>.
            Token holders must actively <em>delegate</em> their voting rights—either to themselves (self-delegation) or to a trusted delegate address.
          </p>
          <p className="text-indigo-200/90">
            Delegation checkpoints your voting power at specific block heights so that votes on proposals are snapshot-safe and immune to flash-loan voting attacks.
          </p>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Token Balance */}
        <Card>
          <div className="space-y-1">
            <span className="text-xs text-slate-400 flex items-center justify-between">
              <span>Token Balance</span>
              <Coins className="w-4 h-4 text-violet-400" />
            </span>
            <div className="pt-2">
              <span className="text-2xl font-bold text-white font-mono">
                {formatTokens(userBalance)}
              </span>
              <span className="text-xs text-slate-400 ml-1 font-mono">GOV</span>
            </div>
            <p className="text-[11px] text-slate-400">Tokens in connected wallet</p>
          </div>
        </Card>

        {/* Voting Power */}
        <Card>
          <div className="space-y-1">
            <span className="text-xs text-slate-400 flex items-center justify-between">
              <span>Active Voting Power</span>
              <Vote className="w-4 h-4 text-indigo-400" />
            </span>
            <div className="pt-2">
              <span className="text-2xl font-bold text-white font-mono">
                {formatTokens(userVotingPower)}
              </span>
              <span className="text-xs text-slate-400 ml-1 font-mono">GOV</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {userVotingPower === 0n && userBalance > 0n ? (
                <span className="text-amber-400">Undelegated (Delegate to activate)</span>
              ) : (
                <span className="text-emerald-400">Active voting weight</span>
              )}
            </p>
          </div>
        </Card>

        {/* Current Delegate */}
        <Card>
          <div className="space-y-1">
            <span className="text-xs text-slate-400 flex items-center justify-between">
              <span>Current Delegate</span>
              <UserCheck className="w-4 h-4 text-emerald-400" />
            </span>
            <div className="pt-2">
              <span className="text-sm font-semibold text-white font-mono truncate block" title={currentDelegate}>
                {hasNoDelegation
                  ? 'None (0x0)'
                  : isSelfDelegated
                  ? 'Self (Your Wallet)'
                  : shortenAddress(currentDelegate, 6)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {isSelfDelegated ? (
                <span className="text-emerald-400 font-medium">Self-delegated</span>
              ) : hasNoDelegation ? (
                <span className="text-amber-400 font-medium">No active delegate</span>
              ) : (
                <span className="text-indigo-400 font-medium">Delegated to representative</span>
              )}
            </p>
          </div>
        </Card>
      </div>

      {/* Delegation Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Self Delegation */}
        <Card
          title="Self-Delegation"
          subtitle="Activate voting power for your own connected wallet address"
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-300 leading-relaxed">
              Click below to self-delegate your entire token balance. This makes your tokens immediately count towards quorum and proposal voting in future blocks.
            </p>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-slate-400">Your Wallet:</span>
              <span className="font-mono text-slate-200 block truncate">
                {address || 'Wallet not connected'}
              </span>
            </div>

            <Button
              variant={isSelfDelegated ? 'secondary' : 'primary'}
              className="w-full"
              isLoading={isDelegatingSelf}
              disabled={!isConnected || isSelfDelegated || userBalance === 0n}
              onClick={handleSelfDelegate}
              icon={UserCheck}
            >
              {isSelfDelegated ? 'Already Self-Delegated' : 'Activate: Delegate to Self'}
            </Button>
          </div>
        </Card>

        {/* Card 2: Delegate to Custom Address */}
        <Card
          title="Delegate to Representative"
          subtitle="Assign your voting weight to another Ethereum address"
        >
          <form onSubmit={handleCustomDelegate} className="space-y-4">
            <Input
              label="Representative Address"
              placeholder="0x..."
              value={customDelegate}
              onChange={(e) => setCustomDelegate(e.target.value)}
              helperText="The delegate will vote with your tokens' weight. You retain token ownership."
              required
            />

            <Button
              type="submit"
              variant="outline"
              className="w-full"
              isLoading={isDelegatingCustom}
              disabled={!isConnected || userBalance === 0n}
            >
              Delegate to Address
            </Button>
          </form>
        </Card>
      </div>

      {/* Transfer Tokens Form & Token Contract Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Transfer tokens */}
        <Card
          title="Transfer GOV Tokens"
          subtitle="Distribute tokens to other accounts on your local testnet"
        >
          <form onSubmit={handleTransfer} className="space-y-4">
            <Input
              label="Recipient Address"
              placeholder="0x..."
              value={transferRecipient}
              onChange={(e) => setTransferRecipient(e.target.value)}
              required
            />

            <Input
              label="Amount to Transfer"
              type="number"
              step="any"
              placeholder="e.g. 50000"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              suffix="GOV"
              helperText={`Available: ${formatTokens(userBalance)} GOV`}
              required
            />

            <Button
              type="submit"
              variant="secondary"
              className="w-full"
              isLoading={isTransferring}
              disabled={!isConnected || userBalance === 0n}
              icon={Send}
            >
              Transfer Tokens
            </Button>
          </form>
        </Card>

        {/* Token Contract Technical Specs */}
        <Card
          title="Contract Details"
          subtitle="GovernanceToken specification"
        >
          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Token Name</span>
              <span className="text-slate-200 font-semibold">{token?.name || 'Governance Token'}</span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Symbol</span>
              <span className="text-slate-200 font-mono font-semibold">{token?.symbol || 'GOV'}</span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Decimals</span>
              <span className="text-slate-200 font-mono">18</span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Total Supply</span>
              <span className="text-slate-200 font-mono">{formatTokens(token?.totalSupply)} GOV</span>
            </div>

            <div className="pt-2">
              <span className="text-slate-400 block mb-1">Contract Address</span>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="font-mono text-[11px] text-indigo-300 truncate mr-2">
                  {addresses?.GovernanceToken}
                </span>
                <button
                  type="button"
                  onClick={handleCopyContract}
                  className="p-1 text-slate-400 hover:text-white transition-colors shrink-0"
                  title="Copy Token Address"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {copiedAddress && <span className="text-[10px] text-emerald-400 mt-1 block">Copied to clipboard!</span>}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
