import React from 'react';
import { useWeb3 } from '../../context/Web3Context';
import { Button } from '../common/Button';
import { shortenAddress, formatEther } from '../../utils/formatters';
import {
  Wallet,
  LogOut,
  RefreshCw,
  AlertTriangle,
  Radio,
  Menu,
} from 'lucide-react';

export function Header({ onMenuClick, onRefresh, isRefreshing = false }) {
  const {
    address,
    isCorrectNetwork,
    isConnected,
    isConnecting,
    chainId,
    rpcStatus,
    ethBalance,
    connectWallet,
    disconnectWallet,
    switchNetwork,
  } = useWeb3();

  return (
    <header className="sticky top-0 z-30 w-full glass-panel border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
      {/* Left side: Hamburger menu for mobile */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* RPC Status Indicator */}
        <div className="hidden sm:flex items-center gap-2 text-xs">
          {rpcStatus.online ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[11px]">Block #{rpcStatus.blockNumber}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300">
              <Radio className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-[11px]">RPC Offline: Start Hardhat Node</span>
            </div>
          )}
        </div>
      </div>

      {/* Right side: Network pill, Refresh, and Wallet Connection */}
      <div className="flex items-center gap-2.5">
        {/* Global Refresh Button */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Refresh on-chain data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        )}

        {/* Network indicator & Switch Button */}
        {isConnected && !isCorrectNetwork && (
          <Button
            size="sm"
            variant="danger"
            onClick={switchNetwork}
            icon={AlertTriangle}
          >
            Switch Network (31337)
          </Button>
        )}

        {isConnected && isCorrectNetwork && (
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-medium">Hardhat Local</span>
          </div>
        )}

        {/* Wallet Button */}
        {isConnected ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 text-xs">
              <div className="hidden sm:block text-slate-400 font-mono">
                {formatEther(ethBalance, 3)} ETH
              </div>
              <div className="w-px h-3 bg-slate-800 hidden sm:block" />
              <div className="font-mono font-medium text-slate-200">
                {shortenAddress(address)}
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={disconnectWallet}
              title="Disconnect Wallet"
              className="px-2.5"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-400 hover:text-rose-400" />
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="primary"
            isLoading={isConnecting}
            onClick={connectWallet}
            icon={Wallet}
          >
            Connect Wallet
          </Button>
        )}
      </div>
    </header>
  );
}
