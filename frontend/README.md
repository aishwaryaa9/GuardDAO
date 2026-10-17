# GuardDAO — Frontend

Frontend for **GuardDAO: A Secure and Risk-Aware Blockchain Governance and Treasury Management System**.

**Secure Governance. Accountable Funding. Trusted Participation.**

Built with **React**, **Vite**, **Tailwind CSS**, and **ethers.js v6**.

The frontend integrates directly with GuardDAO's **DAOGovernor**, **DAOTimelock**, **GovernanceToken (ERC20Votes)**, **Treasury**, **MilestoneEscrow**, and **DAOReputation** contracts.

---

## 🏛️ Architecture Overview

The frontend keeps UI components separate from blockchain interaction logic and now includes policy analysis, staged funding, and reputation views:

```
frontend/
├── src/
│   ├── components/
│   │   ├── common/           # Button, Card, Badge, Modal, Input, ProgressBar, LoadingSkeleton, EmptyState
│   │   ├── dev/              # HardhatSimulator (block mining & time acceleration toolbar)
│   │   ├── layout/           # Sidebar, Header, Layout, responsive navigation
│   │   └── proposals/        # ProposalCard, ProposalStatusBadge, VoteBreakdown, VoteModal, ProposalDetailsModal
│   ├── config/
│   │   ├── contracts.js      # Centralized addresses, chain configs, and ABI imports
│   │   ├── deployment.json   # Local addresses generated from Ignition
│   │   └── abis/             # Generated Hardhat ABIs for all six contracts
│   ├── context/
│   │   ├── Web3Context.jsx   # MetaMask session, chain validation (31337), RPC liveness, accountsChanged / chainChanged
│   │   └── ToastContext.jsx  # Notification toasts for submitted, pending, confirmed, and failed transactions
│   ├── hooks/
│   │   ├── useGovernance.jsx # Reactive DAO and token metrics loader (balances, voting power, quorum rules)
│   │   └── useProposals.jsx  # Event-based proposal discovery, filtering, search, and lifecycle states
│   ├── pages/
│   │   ├── Dashboard.jsx     # On-chain metrics, token overview, treasury balance, and recent proposals
│   │   ├── Proposals.jsx     # Searchable/filterable proposal directory with voting status and quorum bars
│   │   ├── CreateProposal.jsx# Proposal creation with encoded treasury actions and threshold validation
│   │   ├── TokenDelegation.jsx# ERC20Votes self-delegation, representative delegation, and token transfers
│   │   ├── Treasury.jsx      # Treasury reserves, spending proposals, and payout history
│   │   ├── RiskAssessment.jsx# Current policy checks and advisory proposal warnings
│   │   ├── MilestoneFunding.jsx# Governance-funded escrow and milestone review workflow
│   │   └── ReputationDashboard.jsx# Contribution points and award/revocation history
│   ├── services/
│   │   ├── contracts.js      # ethers.js v6 contract factories, read/write helpers
│   │   ├── hardhatDev.js     # hardhat_mine & evm_increaseTime helpers for local testnet acceleration
│   │   ├── proposalIndexer.js# Lightweight event filter discovery for ProposalCreated events & calldata decoder
│   │   └── provider.js       # JsonRpcProvider & BrowserProvider management with network switcher
│   ├── utils/
│   │   ├── constants.js      # OpenZeppelin Governor ProposalState enum, VoteType enum, chain parameters
│   │   ├── errors.js         # User-friendly error translator for reverts, user rejections, and gas errors
│   │   └── formatters.js     # Address shortening, ether formatting, token units, and block time estimates
│   ├── App.jsx               # Application entry point with providers and active view switching
│   ├── index.css             # Dark theme styling, glassmorphism, and custom scrollbars
│   └── main.jsx              # React DOM initialization
├── index.html
├── package.json
├── tailwind.config.js
└── vite.config.js
```

---

## ⚡ Verified Local Contract Deployments

The addresses in `src/config/deployment.json` are generated from the full GuardDAO Ignition deployment on Hardhat Local (Chain ID: `31337`):

| Contract | Address | Role / Description |
| :--- | :--- | :--- |
| **GovernanceToken** | `0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1` | ERC-20 token with `ERC20Votes` checkpointing (`GOV`) |
| **DAOGovernor** | `0x59b670e9fA9D0A427751Af201D676719a970857b` | Governor with target/function allowlist and Timelock control |
| **DAOTimelock** | `0x0B306BF915C4d645ff596e518fAf3F9669b97016` | Timelock Controller (minimum delay: 86,400s) |
| **Treasury** | `0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE` | Timelock-owned vault with recipient and spend policies |
| **MilestoneEscrow** | `0x68B1D87F95878fE05B998F19b66F4baba5De1aed` | Staged ETH funding and reviewer-gated releases |
| **DAOReputation** | `0xc6e7DF5E7b4f2A278906862b61205850344D4e7d` | Non-transferable contribution reputation registry |

> [!NOTE]
> If you start a fresh Hardhat node and redeploy, run `npm run sync:frontend` from the repository root to update the generated address and ABI files. Deployment creates a new local system; it does not upgrade existing contracts.

---

## 🚀 Local Development Workflow

To run the complete system locally:

### Terminal 1: Start Hardhat Node
At the repository root:
```bash
npx hardhat node
```
This starts the local JSON-RPC server at `http://127.0.0.1:8545` on Chain ID `31337`.

> Use the local Hardhat node's generated development accounts only. Never import these accounts into another network or reuse them for real funds.

### Terminal 2: Deploy GuardDAO and synchronize frontend configuration
At the repository root:
```bash
npm run deploy:guarddao
npm run sync:frontend
```
The original `npm run deploy:local` command deploys only the original four governance contracts.

### Terminal 3: Start the Frontend
Inside the `frontend/` directory:
```bash
cd frontend
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🦊 MetaMask Configuration

To connect MetaMask to the local Hardhat network:

1. **Network Name**: Hardhat Local
2. **New RPC URL**: `http://127.0.0.1:8545`
3. **Chain ID**: `31337`
4. **Currency Symbol**: `ETH`

> [!TIP]
> **One-Click Switch**: If you connect MetaMask on another network (e.g., Ethereum Mainnet or Sepolia), the frontend header displays a **"Switch Network (31337)"** button that automatically triggers `wallet_addEthereumChain` or `wallet_switchEthereumChain`.

### Using Hardhat Test Accounts
If a wallet is needed for local testing, use one of the development accounts printed by the currently running Hardhat node. These public test credentials are for the local chain only; never reuse them on a public network or with real funds.

---

## 🗳️ Governance Lifecycle & Features

### 1. ERC20Votes Token Delegation
- **Concept**: In OpenZeppelin `ERC20Votes`, holding tokens alone does not grant active voting weight until delegated.
- **Actions**:
  - **Self-Delegate**: 1-click action to delegate voting power to your own address.
  - **Representative Delegation**: Delegate your voting weight to another Ethereum address.
  - **Transfer**: Send tokens to other local test accounts.

### 2. Proposal Discovery & Indexing
- Standard OpenZeppelin Governor contracts do not expose an enumerable proposal array.
- The frontend features a lightweight event indexer that queries `governor.queryFilter(governor.filters.ProposalCreated(), 0, 'latest')`.
- For each proposal, the app extracts:
  - Proposal ID and Proposer address
  - Targets, ETH values, and Calldatas
  - Description and extracted Title
  - Voting Start Block, End Block, and Snapshot
  - Real-time `governor.state(proposalId)`
  - Votes breakdown (`againstVotes`, `forVotes`, `abstainVotes`)
  - Quorum requirement (`governor.quorum(snapshot)`)
  - User's snapshot voting power (`governor.getVotes(user, snapshot)`) and `hasVoted` status.

### 3. Creating Proposals
- Allows encoding:
  - **Treasury ETH Transfer**: Automatically encodes `Treasury.disburseEth(recipient, amount, reason)`.
  - **Treasury Token Transfer**: Encodes `Treasury.disburseToken(token, recipient, amount, reason)`.
  - **Custom Call**: Specify target contract and calldata; the active Governor selector allowlist is checked before submission, and attached ETH value is always zero.
- **Threshold Check**: Enforces the 1 GOV proposal threshold configured in `DAOGovernor`.
- **Action Preview**: Shows the encoded calldata and target parameters prior to wallet signing.

### 4. Voting
- Options: **For** (1), **Against** (0), **Abstain** (2).
- Validates that user holds voting weight at the proposal snapshot block.
- Prevents double voting when `governor.hasVoted` returns true.
- Optional reason input supporting `governor.castVoteWithReason`.

### 5. Queue & Execute Timelock Flow
- **Queue**: When a proposal concludes with `Succeeded` state (`forVotes > againstVotes` and `forVotes + abstainVotes >= quorum`), any user can queue the proposal into the Timelock Controller (`governor.queue(...)`).
- **Timelock Delay**: Displays countdown to the Timelock ETA (`proposalEta(proposalId)`).
- **Execute**: Once the timelock delay has elapsed, anyone can trigger `governor.execute(...)`.
- **Treasury Payout**: The timelock disburses ETH/tokens to the recipient, emitting `EthDisbursed`.

### 6. Proposal Risk Assessment
- Reads each proposal's target/function allowlist status and current Treasury destination/spend policy.
- Flags decoded ETH or token transfers that currently violate recipient or amount limits.
- Shows contextual warnings for unknown calls, policy administration, off-chain evidence references, and reputation administration.
- This is advisory analysis of **current state**, not transaction simulation or a guarantee of future execution.

### 7. Milestone Funding
- Governance setup must approve the escrow as a Treasury recipient and link the reputation registry. The escrow awarder role is granted during deployment and remains Timelock-governed.
- A funding proposal atomically calls Treasury disbursement and escrow plan registration; the total must satisfy current Treasury policy.
- Recipients submit evidence references; the designated independent reviewer may approve or reject. Approved milestones can be released to the fixed recipient; expired, rejected, or cancelled allocations can return to Treasury.
- The escrow records references and reviewer decisions but does not verify work. Reviewer trust, wallet identity, and off-chain evidence remain limitations.

### 8. Governance Reputation
- Displays authorized contribution points and event history separately from GOV voting power.
- Points are non-transferable and are not voting weight, proof of identity, proof of contribution, or protection against Sybil activity.

### 9. Built-in Local Chain Testing Simulator
For effortless local testing on Chain `31337`, the frontend includes a collapsible testnet toolbar:
- **Advance 2 Blocks**: Fast-forwards past the 1-block voting delay (transitions proposal from `Pending` → `Active`).
- **Advance 50,401 Blocks**: Fast-forwards past the ~1 week voting period (transitions proposal from `Active` → `Succeeded` or `Defeated`).
- **Fast Forward 24h Timelock**: Advances timestamp by 86,400s (transitions proposal from `Queued` → ready to execute).
- **Mine 1 Block**: Mines an arbitrary single block on Hardhat.

---

## 🔒 Security & Best Practices

- **Zero Hardcoded Balances**: All metrics (balances, votes, state, quorum) are fetched live via ethers.js v6.
- **Safe BigInt Math**: No floating-point rounding errors for financial or wei quantities.
- **No Secret Exposure**: Zero private keys or mnemonic phrases in frontend code or environment variables.
- **Strict Network Validation**: Blocks transactions when MetaMask is not connected to the local chain.
- **Full Error Parsing**: Translates contract reverts, user rejections (`4001`), and gas failures into clear toast messages.

---

## 📦 Production Build

To verify and bundle the frontend for production:

```bash
cd frontend
npm run build
npm run preview
```
The optimized bundle is generated in `dist/` with separate chunks for `vendor`, `ethers`, and UI components.
