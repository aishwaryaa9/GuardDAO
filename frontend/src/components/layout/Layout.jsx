import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { HardhatSimulator } from '../dev/HardhatSimulator';
import { useWeb3 } from '../../context/Web3Context';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Button } from '../common/Button';

export function Layout({ currentTab, setCurrentTab, children, onRefresh, isRefreshing }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isConnected, isCorrectNetwork, chainId, switchNetwork, rpcStatus } = useWeb3();

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
        />

        {/* Global Warning Banners */}
        <div className="px-4 sm:px-8 pt-4 space-y-3">
          {/* Wrong Network Banner */}
          {isConnected && !isCorrectNetwork && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <p className="font-semibold text-rose-100">Wrong Network Detected</p>
                  <p className="text-rose-300/90 mt-0.5">
                    Your wallet is connected to Chain ID {chainId}. Please switch to Hardhat Local (Chain 31337) to interact with DAO contracts.
                  </p>
                </div>
              </div>
              <Button size="sm" variant="danger" onClick={switchNetwork}>
                Switch to Hardhat Local
              </Button>
            </div>
          )}

          {/* RPC Offline Banner */}
          {!rpcStatus.online && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="font-semibold text-amber-100">Local RPC Node Not Reachable</p>
                <p className="text-amber-300/90 mt-0.5">
                  Unable to connect to <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono">http://127.0.0.1:8545</code>. Run <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono">npx hardhat node</code> in your terminal to start the local chain.
                </p>
              </div>
            </div>
          )}

          {/* Local Chain Simulator */}
          <HardhatSimulator onActionComplete={onRefresh} />
        </div>

        {/* Main Routed Page */}
        <main className="flex-1 px-4 sm:px-8 py-6">{children}</main>

        {/* Footer */}
        <footer className="px-4 sm:px-8 py-6 border-t border-slate-900 text-center text-xs text-slate-400">
          <p>
            <span className="block">GuardDAO • Secure Governance. Accountable Funding. Trusted Participation.</span>
            <span className="block mt-1">OpenZeppelin Governor v5 & Timelock Controller • Hardhat Local Network</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
