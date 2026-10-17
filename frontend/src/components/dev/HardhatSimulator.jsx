import React, { useState } from 'react';
import { Button } from '../common/Button';
import { hardhatMineBlocks, hardhatIncreaseTime } from '../../services/hardhatDev';
import { useToast } from '../../context/ToastContext';
import { useWeb3 } from '../../context/Web3Context';
import { FastForward, Play, Clock, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

export function HardhatSimulator({ onActionComplete }) {
  const { isCorrectNetwork, rpcStatus, verifyRpc } = useWeb3();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  if (!isCorrectNetwork) return null;

  const handleMine = async (count, label) => {
    setLoading(true);
    try {
      const newBlock = await hardhatMineBlocks(count);
      addToast({
        title: `${label} Completed`,
        message: `Mined ${count} blocks. Current block height is #${newBlock}.`,
        type: 'success',
      });
      await verifyRpc();
      if (onActionComplete) onActionComplete();
    } catch (err) {
      addToast({
        title: 'Mining Failed',
        message: err.message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTimeTravel = async (seconds, label) => {
    setLoading(true);
    try {
      await hardhatIncreaseTime(seconds);
      addToast({
        title: `${label} Completed`,
        message: `Fast forwarded block timestamp by ${seconds / 3600} hours.`,
        type: 'success',
      });
      await verifyRpc();
      if (onActionComplete) onActionComplete();
    } catch (err) {
      addToast({
        title: 'Time Travel Failed',
        message: err.message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/20 backdrop-blur-md overflow-hidden text-xs">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-indigo-500/10 transition-colors"
      >
        <div className="flex items-center gap-2 text-indigo-300 font-semibold">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>Local Chain Testing Simulator (Chain 31337)</span>
          <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200">
            Block #{rpcStatus.blockNumber}
          </span>
        </div>
        <div className="text-indigo-400">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {isOpen && (
        <div className="p-4 pt-2 border-t border-indigo-500/20 space-y-3">
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Quickly advance Hardhat blocks and time to test the governance proposal lifecycle (voting delay, voting period, and timelock delay) without waiting.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              isLoading={loading}
              onClick={() => handleMine(1, 'Mine 1 Block')}
              icon={Play}
            >
              Mine 1 Block
            </Button>

            <Button
              size="sm"
              variant="outline"
              isLoading={loading}
              onClick={() => handleMine(2, 'Advance Voting Delay')}
              icon={FastForward}
            >
              Advance 2 Blocks (Activate Proposal)
            </Button>

            <Button
              size="sm"
              variant="outline"
              isLoading={loading}
              onClick={() => handleMine(50401, 'Advance Voting Period')}
              icon={FastForward}
            >
              Advance 50,401 Blocks (End Voting)
            </Button>

            <Button
              size="sm"
              variant="outline"
              isLoading={loading}
              onClick={() => handleTimeTravel(86401, 'Fast Forward Timelock')}
              icon={Clock}
            >
              Fast Forward 24h (Timelock Delay)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
