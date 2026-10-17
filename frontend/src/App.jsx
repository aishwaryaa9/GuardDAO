import React, { useState } from 'react';
import { ToastProvider } from './context/ToastContext';
import { Web3Provider } from './context/Web3Context';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Proposals } from './pages/Proposals';
import { CreateProposal } from './pages/CreateProposal';
import { TokenDelegation } from './pages/TokenDelegation';
import { Treasury } from './pages/Treasury';
import { RiskAssessment } from './pages/RiskAssessment';
import { MilestoneFunding } from './pages/MilestoneFunding';
import { ReputationDashboard } from './pages/ReputationDashboard';
import { TreasuryAuditExplorer } from './pages/TreasuryAuditExplorer';
import { ProposalDetailsModal } from './components/proposals/ProposalDetailsModal';
import { VoteModal } from './components/proposals/VoteModal';
import { useGovernance } from './hooks/useGovernance';
import { useProposals } from './hooks/useProposals';

function MainApp() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isVoteOpen, setIsVoteOpen] = useState(false);
  const [isGlobalRefreshing, setIsGlobalRefreshing] = useState(false);

  const governanceData = useGovernance();
  const proposalsData = useProposals();

  const handleGlobalRefresh = async () => {
    setIsGlobalRefreshing(true);
    try {
      await Promise.all([
        governanceData.refresh(),
        proposalsData.refresh(),
      ]);
    } finally {
      setIsGlobalRefreshing(false);
    }
  };

  const handleViewProposal = (proposal) => {
    setSelectedProposal(proposal);
    setIsDetailsOpen(true);
  };

  const handleVoteProposal = (proposal) => {
    setSelectedProposal(proposal);
    setIsVoteOpen(true);
  };

  return (
    <Layout
      currentTab={currentTab}
      setCurrentTab={setCurrentTab}
      onRefresh={handleGlobalRefresh}
      isRefreshing={isGlobalRefreshing}
    >
      {currentTab === 'dashboard' && (
        <Dashboard
          governanceData={governanceData}
          proposalsData={proposalsData}
          onNavigate={setCurrentTab}
          onViewProposal={handleViewProposal}
          onVoteProposal={handleVoteProposal}
        />
      )}

      {currentTab === 'proposals' && (
        <Proposals
          proposalsData={proposalsData}
          onNavigate={setCurrentTab}
          onViewProposal={handleViewProposal}
          onVoteProposal={handleVoteProposal}
        />
      )}

      {currentTab === 'create' && (
        <CreateProposal
          governanceData={governanceData}
          onProposalCreated={handleGlobalRefresh}
          onNavigate={setCurrentTab}
        />
      )}

      {currentTab === 'token' && (
        <TokenDelegation
          governanceData={governanceData}
          onRefresh={handleGlobalRefresh}
        />
      )}

      {currentTab === 'treasury' && (
        <Treasury
          governanceData={governanceData}
          proposalsData={proposalsData}
          onNavigate={setCurrentTab}
          onViewProposal={handleViewProposal}
          onVoteProposal={handleVoteProposal}
          onRefresh={handleGlobalRefresh}
        />
      )}

      {currentTab === 'risk' && (
        <RiskAssessment proposalsData={proposalsData} />
      )}

      {currentTab === 'milestones' && (
        <MilestoneFunding onRefresh={handleGlobalRefresh} />
      )}

      {currentTab === 'reputation' && (
        <ReputationDashboard />
      )}

      {currentTab === 'audit' && (
        <TreasuryAuditExplorer />
      )}

      {/* Global Modals */}
      <ProposalDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        proposal={selectedProposal}
        onOpenVote={(prop) => {
          setSelectedProposal(prop);
          setIsVoteOpen(true);
        }}
        onRefresh={handleGlobalRefresh}
      />

      <VoteModal
        isOpen={isVoteOpen}
        onClose={() => setIsVoteOpen(false)}
        proposal={selectedProposal}
        onSuccess={handleGlobalRefresh}
      />
    </Layout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Web3Provider>
        <MainApp />
      </Web3Provider>
    </ToastProvider>
  );
}
