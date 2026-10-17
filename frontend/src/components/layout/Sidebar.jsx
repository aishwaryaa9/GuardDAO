import React from 'react';
import {
  LayoutDashboard,
  Vote,
  PlusCircle,
  Coins,
  Vault,
  Shield,
  Layers,
  ChevronRight,
  ShieldAlert,
  Award,
  ScrollText,
} from 'lucide-react';
import { getContractAddresses } from '../../config/contracts';
import { shortenAddress } from '../../utils/formatters';

export function Sidebar({ currentTab, setCurrentTab, isOpen, setIsOpen }) {
  const governorAddress = getContractAddresses().DAOGovernor;
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'proposals', label: 'Proposals', icon: Vote },
    { id: 'create', label: 'Create Proposal', icon: PlusCircle },
    { id: 'token', label: 'Governance Token', icon: Coins },
    { id: 'treasury', label: 'Treasury', icon: Vault },
    { id: 'risk', label: 'Proposal Risk', icon: ShieldAlert },
    { id: 'milestones', label: 'Milestone Funding', icon: Layers },
    { id: 'reputation', label: 'Reputation', icon: Award },
    { id: 'audit', label: 'Treasury Audit', icon: ScrollText },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen w-64 glass-panel border-r border-slate-800/80 transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } flex flex-col justify-between`}
      >
        <div className="p-6">
          {/* DAO Branding */}
          <div className="flex items-center gap-3 pb-6 border-b border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-white tracking-tight leading-tight">GuardDAO</h1>
              <span className="text-[11px] font-mono text-indigo-400">Governor v5</span>
            </div>
          </div>

          {/* Navigation links */}
          <nav className="mt-6 space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentTab(item.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 text-indigo-200" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Protocol Info */}
        <div className="p-6 border-t border-slate-800/80">
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                Network
              </span>
              <span className="font-mono text-slate-200">Local (31337)</span>
            </div>
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>Governor</span>
              <span className="font-mono text-indigo-300">{shortenAddress(governorAddress, 4)}</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
