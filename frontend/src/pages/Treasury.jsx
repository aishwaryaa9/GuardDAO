import React, { useState } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { ProposalCard } from '../components/proposals/ProposalCard';
import { useWeb3 } from '../context/Web3Context';
import { useToast } from '../context/ToastContext';
import { depositEthToTreasury } from '../services/contracts';
import { parseContractError } from '../utils/errors';
import {
  formatEther,
  formatTokens,
  shortenAddress,
  parseEtherSafely,
} from '../utils/formatters';
import {
  Vault,
  ShieldCheck,
  Coins,
  ArrowUpRight,
  Lock,
  PlusCircle,
  Copy,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export function Treasury({
  governanceData,
  proposalsData,
  onNavigate,
  onViewProposal,
  onVoteProposal,
  onRefresh,
}) {
  const { isConnected, signer } = useWeb3();
  const { addToast, updateToast } = useToast();
  const { treasury, addresses } = governanceData;
  const { proposals } = proposalsData;

  const [depositAmount, setDepositAmount] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [copiedTreasury, setCopiedTreasury] = useState(false);

  // Filter proposals targeting the treasury
  const treasuryProposals = proposals.filter((p) =>
    p.targets?.some(
      (t) => t.toLowerCase() === (addresses?.Treasury || '').toLowerCase()
    )
  );

  const handleCopyTreasury = () => {
    navigator.clipboard.writeText(addresses?.Treasury || '');
    setCopiedTreasury(true);
    setTimeout(() => setCopiedTreasury(false), 2000);
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!signer) return;

    const amountWei = parseEtherSafely(depositAmount);
    if (amountWei <= 0n) {
      addToast({
        title: 'Invalid Amount',
        message: 'Please enter a deposit amount greater than 0.',
        type: 'error',
      });
      return;
    }

    setIsDepositing(true);
    const toastId = addToast({
      title: 'Depositing ETH...',
      message: `Sending ${depositAmount} ETH to Treasury contract...`,
      type: 'pending',
    });

    try {
      const receipt = await depositEthToTreasury(signer, amountWei);
      updateToast(toastId, {
        title: 'Deposit Confirmed!',
        message: `Successfully deposited ${depositAmount} ETH into the DAO Treasury.`,
        type: 'success',
        txHash: receipt.hash,
      });
      setDepositAmount('');
      if (onRefresh) onRefresh();
    } catch (err) {
      updateToast(toastId, {
        title: 'Deposit Failed',
        message: parseContractError(err),
        type: 'error',
      });
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">DAO Treasury</h1>
          <p className="text-xs text-slate-400 mt-1">
            Community-owned reserve held and guarded by the DAOTimelock Controller.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => onNavigate('create')}
          icon={PlusCircle}
        >
          Propose Treasury Spend
        </Button>
      </div>

      {/* Security Architecture Callout */}
      <div className="flex items-start gap-3.5 p-4 sm:p-5 rounded-2xl bg-cyan-950/25 border border-cyan-500/25 text-xs text-cyan-200">
        <Lock className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <h3 className="font-semibold text-cyan-100 text-sm">
            Timelock-Gated Spend Security Model
          </h3>
          <p className="text-cyan-200/90">
            The Treasury contract is exclusively owned by the <strong>DAOTimelock Controller</strong> (<code>{shortenAddress(treasury?.owner, 6)}</code>).
            There are zero administrative backdoors or multi-sig shortcuts.
          </p>
          <p className="text-cyan-200/90">
            Every withdrawal of ETH or ERC-20 tokens must be approved through a formal DAO Governor vote and remain queued in the timelock for the minimum 24-hour delay before execution can occur.
          </p>
        </div>
      </div>

      {/* Balances Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* ETH Balance */}
        <Card className="hover:border-emerald-500/30">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Treasury ETH Balance</span>
              <Vault className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <span className="text-3xl font-bold text-white font-mono">
                {formatEther(treasury?.ethBalance, 4)}
              </span>
              <span className="text-xs text-slate-400 ml-1.5 font-mono">ETH</span>
            </div>
            <p className="text-[11px] text-slate-400">Available on-chain reserves</p>
          </div>
        </Card>

        {/* GOV Token Balance */}
        <Card className="hover:border-violet-500/30">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Treasury GOV Tokens</span>
              <Coins className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <span className="text-3xl font-bold text-white font-mono">
                {formatTokens(treasury?.govBalance)}
              </span>
              <span className="text-xs text-slate-400 ml-1.5 font-mono">GOV</span>
            </div>
            <p className="text-[11px] text-slate-400">DAO-owned governance tokens</p>
          </div>
        </Card>

        {/* Ownership Spec */}
        <Card>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Treasury Owner (Timelock)</span>
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <span className="text-sm font-semibold font-mono text-slate-200 block truncate" title={treasury?.owner}>
                {treasury?.owner || 'Loading...'}
              </span>
            </div>
            <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Controlled by DAOTimelock
            </p>
          </div>
        </Card>
      </div>

      {/* Deposit ETH & Contract Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Deposit Helper */}
        <Card
          title="Fund the Treasury"
          subtitle="Deposit ETH directly into the Treasury contract for test proposals"
        >
          <form onSubmit={handleDeposit} className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Anyone can send ETH to the Treasury's <code>receive()</code> function. Use this helper to fund the treasury so you can test proposals that disburse ETH.
            </p>

            <Input
              label="Deposit Amount"
              type="number"
              step="any"
              placeholder="e.g. 5.0"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              suffix="ETH"
              required
            />

            <Button
              type="submit"
              variant="success"
              className="w-full"
              isLoading={isDepositing}
              disabled={!isConnected}
            >
              Deposit ETH to Treasury
            </Button>
          </form>
        </Card>

        {/* Treasury Contract Specs */}
        <Card
          title="Treasury Contract Information"
          subtitle="On-chain deployment parameters"
        >
          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Timelock Controller</span>
              <span className="font-mono text-slate-200">{shortenAddress(addresses?.DAOTimelock, 6)}</span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Treasury Contract</span>
              <span className="font-mono text-slate-200">{shortenAddress(addresses?.Treasury, 6)}</span>
            </div>

            <div className="pt-2">
              <span className="text-slate-400 block mb-1">Treasury Address (Full)</span>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="font-mono text-[11px] text-indigo-300 truncate mr-2">
                  {addresses?.Treasury}
                </span>
                <button
                  type="button"
                  onClick={handleCopyTreasury}
                  className="p-1 text-slate-400 hover:text-white transition-colors shrink-0"
                  title="Copy Address"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {copiedTreasury && <span className="text-[10px] text-emerald-400 mt-1 block">Copied!</span>}
            </div>
          </div>
        </Card>
      </div>

      {/* Treasury Proposal Activity */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Treasury Spend Proposals</h2>
          <p className="text-xs text-slate-400">
            Proposals that target the Treasury contract for disbursements ({treasuryProposals.length})
          </p>
        </div>

        {treasuryProposals.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 text-xs text-slate-400">
            No treasury spend proposals recorded yet. Create a proposal to disburse ETH or tokens.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {treasuryProposals.map((proposal) => (
              <ProposalCard
                key={proposal.proposalId}
                proposal={proposal}
                onViewDetails={onViewProposal}
                onVote={onVoteProposal}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
