# GuardDAO: A Secure and Risk-Aware Blockchain Governance and Treasury Management System

**Secure Governance. Accountable Funding. Trusted Participation.**

GuardDAO is a risk-aware governance and treasury management system built around token-based voting, Timelock-controlled execution, restricted proposal actions, and staged grant funding.

Built on **OpenZeppelin 5** primitives and the **Hardhat + Ignition** stack. Tests cover governance guardrails, bounded Treasury spending, milestone escrow, and non-transferable contribution reputation.

![Solidity](https://img.shields.io/badge/Solidity-0.8.27-363636?logo=solidity)
![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.0.2-4E5EE4)
![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-FFF100?logo=hardhat&logoColor=black)
![Ignition](https://img.shields.io/badge/Deployment-Hardhat%20Ignition-FFF100?logo=hardhat&logoColor=black)
![Tests](https://img.shields.io/badge/tests-passing-success)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ What's Included

- ✅ **ERC-20 Votes token** (`GovernanceToken.sol`) with EIP-2612 permit support
- ✅ **Timelock controller** (`DAOTimelock.sol`) — enforces a delay between approval and execution
- ✅ **Governor contract** (`DAOGovernor.sol`) — For / Against / Abstain voting, quorum, and timelock-controlled execution
- ✅ **Governor action allowlist** — only approved targets and function selectors can be proposed or executed
- ✅ **Treasury** (`Treasury.sol`) — DAO-owned vault with recipient approvals, per-transaction caps, and elapsed-window limits
- ✅ **Milestone escrow** (`MilestoneEscrow.sol`) — ETH grants released in stages after reviewer approval, with refund paths
- ✅ **Contribution reputation** (`DAOReputation.sol`) — auditable, non-transferable points separate from GOV voting power
- ✅ **Hardhat Ignition** deployment modules — original deployment and complete GuardDAO composition
- ✅ **Hardhat test suite** — governance lifecycle, policy enforcement, escrow accounting, and reputation authorization
- ✅ **Helper scripts** for creating proposals and casting votes from the CLI
- ✅ **IPFS evidence workflow** — optional off-chain upload, on-chain CID/SHA-256 reference, and reviewer integrity checks
- ✅ **Treasury Audit Explorer** — bounded, read-only event history and filtered CSV data export

---

## 🏗️ Architecture

```
         ┌────────────────────────┐
         │   GovernanceToken.sol  │
         │   (ERC-20 Votes)       │
         └────────────┬───────────┘
                      │ voting power
                      ▼
         ┌────────────────────────┐
         │     DAOGovernor.sol    │
         │  • propose             │
         │  • castVote            │
         │  • action allowlist    │
         │  • queue → Timelock    │
         │  • execute             │
         └────────────┬───────────┘
                      │ schedule / execute
                      ▼
         ┌────────────────────────┐
         │    DAOTimelock.sol     │
         │  (TimelockController)  │
         │     1-day delay        │
         └────────────┬───────────┘
                      │ owns (= can call)
                      ▼
         ┌────────────────────────┐
         │      Treasury.sol      │
         │  • recipient approval  │
         │  • spend caps/windows  │
         └────────────┬───────────┘
                      │ governed funding
                      ▼
         ┌────────────────────────┐
         │  MilestoneEscrow.sol   │──── reviewer approval ─────┐
         │  • staged ETH releases │                             ▼
         └────────────────────────┘                 ┌─────────────────────┐
                                                    │ DAOReputation.sol   │
                                                    │ non-transferable   │
                                                    │ contribution points│
                                                    └─────────────────────┘
```

### Smart Contracts

| Contract | Purpose |
|---|---|
| **`GovernanceToken.sol`** | ERC-20 with vote-delegation, snapshots, and EIP-2612 permit |
| **`DAOGovernor.sol`** | OpenZeppelin Governor — For/Against/Abstain voting, 4% quorum, timelock execution |
| **`DAOTimelock.sol`** | TimelockController — queues approved proposals for a 1-day delay before execution |
| **`Treasury.sol`** | Timelock-owned vault with recipient approvals and per-asset transaction/window limits |
| **`MilestoneEscrow.sol`** | Holds Treasury-funded ETH and releases fixed milestone allocations after reviewer approval |
| **`DAOReputation.sol`** | Non-transferable contribution points, separate from GOV balances and voting power |

### Guardrails and trust assumptions

- ETH defaults to a **1 ETH per-transaction** and **5 ETH per 24-hour window** limit. The current implementation uses elapsed windows anchored to `windowStart`, not a strict sliding 24-hour sum; a spend near the end of one window and another just after reset can exceed 5 ETH in a trailing 24-hour interval. ERC-20 limits use that token's smallest unit. See deployment notes before relying on the window limit as a strict rolling cap.
- Payout recipients start unapproved. A successful governance proposal must approve recipients and may adjust asset policies.
- The escrow address must be approved as a Treasury recipient. Funding and plan registration are submitted in one Governor/Timelock batch, so failure rolls back both actions.
- The recipient submits an off-chain evidence reference; an independent reviewer approves or rejects it. The contract records the reference and decision but **does not verify the underlying work**.
- IPFS CID and SHA-256 evidence references are verified by the frontend against retrieved bytes. This demonstrates file integrity only; it does not establish authorship, truthfulness, or completed work.
- Reputation is awarded after reviewer approval, can be revoked through governance, and does not affect GOV balance, delegation, or voting weight. It is not proof of identity or protection against Sybil activity.
- Proposal Risk Assessment reads current on-chain policy and supplies contextual warnings. It is advisory, not transaction simulation and not a guarantee that state will remain unchanged until execution.

---

## 📜 Default Governance Parameters

| Parameter | Value | Notes |
|---|---|---|
| Voting delay | 1 block | Proposal becomes active 1 block after creation |
| Voting period | 50,400 blocks (~1 week at 12s) | Window for voters to cast their vote |
| Proposal threshold | 1 GOV token | Minimum voting power required to submit a proposal |
| Quorum | 4% of supply | For + Abstain votes must reach this for the proposal to be valid |
| Timelock delay | 1 day | Delay between proposal queueing and execution |
| Initial token supply | 1,000,000 GOV | Minted to deployer at construction |

These are the deployed default values. Governor settings and Timelock policies can only be changed through the on-chain governance path when the relevant Governor action is allowlisted; changing a local source default affects only a future deployment.

---

## 📎 IPFS Evidence and Treasury Audit Explorer

### Evidence flow and storage

The milestone recipient can select an allowed document, compute its SHA-256 digest in the browser, and explicitly upload it to the configured IPFS API. The frontend associates the returned CID and digest with the selected plan and milestone using the existing escrow evidence call. The on-chain reference format is:

```text
ipfs://<CID>#sha256=<64-character-lowercase-hex-digest>
```

No evidence file is placed on-chain, and no new contract or deployment is required. The escrow stores and emits the reference through `MilestoneSubmitted`; it does not validate the CID, retrieve the file, or prove that the evidence is truthful. Existing non-IPFS references remain visible but cannot be automatically integrity-verified by the frontend.

For a local Kubo node, configure the frontend environment (for example in the ignored `frontend/.env.local` file):

```dotenv
VITE_IPFS_API_URL=http://127.0.0.1:5001/api/v0
VITE_IPFS_GATEWAY_URL=http://127.0.0.1:8080
```

Restart Vite after changing these values. Configure Kubo CORS for the local GuardDAO origin (`http://localhost:5173`) as needed. Keep its API bound to localhost and do not expose an unauthenticated API port to a network. Vite `VITE_*` values are public client configuration, not secret storage; never put provider credentials or API keys in them. A remote upload provider requiring credentials needs a protected backend proxy, which is not included in this frontend-only integration.

The browser accepts PDF, JSON, plain text, CSV, JPEG, and PNG files up to 10 MiB. Retrieval verification also enforces a 10 MiB response limit. Uploading is a user action; the interface warns that IPFS content can be publicly discoverable. A CID does not guarantee pinning or permanent availability. Do not upload confidential or personal records. Encryption is not implemented; reviewers have no decryption-key workflow. The gateway-retrieved file is hashed as bytes and not rendered as HTML.

Integrity outcomes are reported separately as verified, mismatch, unavailable, or failed. A matching digest shows only that the retrieved bytes match the digest recorded in the on-chain reference. It does not verify the evidence's claims or the real-world identity of a contributor.

### Audit event sources and limits

The read-only explorer decodes these existing events from the configured contracts and presents them as follows:

| Contract | Events included | Explorer presentation |
|---|---|---|
| DAOGovernor | `ProposalCreated`, `VoteCast`, `ProposalQueued`, `ProposalExecuted`, `ProposalCanceled`, `AllowedCallUpdated`, voting/quorum/timelock setting events | Proposal lifecycle, proposer/voter, vote data, execution correlations, and policy/configuration changes |
| DAOTimelock | `CallScheduled`, `CallExecuted`, `CallSalt`, `Cancelled`, `MinDelayChange`, `RoleGranted`, `RoleRevoked` | Timelock operation IDs, target/value/call data, cancellation, delay changes, and role changes |
| Treasury | `EthDisbursed`, `TokenDisbursed`, `AssetPolicyUpdated`, `RecipientPolicyUpdated`, `OwnershipTransferred` | Payout asset, recipient and amount, spending/recipient policy, and ownership changes |
| MilestoneEscrow | `EscrowFunded`, `PlanCreated`, `MilestoneSubmitted`, `MilestoneApproved`, `MilestoneRejected`, `MilestoneReleased`, `MilestoneRefunded`, `PlanCancelled` | Funding, plan/milestone identifiers, reviewer decisions, evidence reference, released/refunded amounts, and cancellation |
| DAOReputation | `ReputationAwarded`, `ReputationRevoked`, `RoleGranted`, `RoleRevoked` | Contribution IDs, recipient, points, category/reason, awarder/revoker, and role changes |
| GovernanceToken | `Transfer`, `DelegateChanged`, `DelegateVotesChanged` | GOV token transfers, delegation changes, and vote-checkpoint updates; ERC-20 approvals are excluded |

The explorer checks the RPC's actual chain ID, reads logs in chunks of at most 2,000 blocks, and caps each search to 100,000 blocks. It displays the searched range and partial retrieval/decode/timestamp failures. Dashboard historical figures are sums/counts of retrieved events within that range, not lifetime totals unless the displayed range covers the full chain history. Treasury and escrow balances are current state, distinct from those historical events. Same-transaction proposal execution can be correlated with Treasury and plan events; later milestone decisions are linked by plan ID.

Only mined event logs are indexed; pending transactions do not appear. Transaction details fetch the receipt and block on request. A missing receipt is reported as unavailable, not as pending or successful. Each refresh queries the current canonical logs and records their block hashes; there is no separate confirmation/finality tracker, and a local-chain reset changes the available history. On local chain 31337, hashes can be copied but no public block explorer link is generated. CSV exports contain the currently filtered retrieved records, block references, chain ID, and export timestamp. Spreadsheet-formula-leading fields are neutralized; the CSV is a data export, not a certified legal audit or proof of complete historical coverage.

---

## 🔄 Proposal Lifecycle

```
1. PROPOSE         →  Holder with ≥1 GOV submits proposal
                       (targets, calldata, description)
                       Proposal state: Pending

2. ACTIVE          →  After votingDelay (1 block)
                       Holders cast votes (For / Against / Abstain)
                       Proposal state: Active

3. SUCCEEDED       →  After votingPeriod (~1 week)
                       For > Against AND (For + Abstain) ≥ Quorum
                       Proposal state: Succeeded

4. QUEUED          →  Anyone calls governor.queue(...)
                       Timelock starts the 1-day delay
                       Proposal state: Queued

5. EXECUTED        →  After timelock delay elapses
                       Anyone calls governor.execute(...)
                       Treasury (or other target) action runs
                       Proposal state: Executed
```

If a proposal fails (insufficient quorum or majority Against), state becomes **Defeated** and nothing happens.

---

## 📂 Project Structure

```
GuardDAO/
├── contracts/
│   ├── GovernanceToken.sol   # ERC20Votes + Permit
│   ├── DAOTimelock.sol       # TimelockController
│   ├── DAOGovernor.sol       # Governor with action allowlist and voting extensions
│   ├── Treasury.sol          # DAO-owned vault and spending policies
│   ├── MilestoneEscrow.sol   # ETH milestone funding and release workflow
│   └── DAOReputation.sol     # Non-transferable contribution points
├── ignition/
│   └── modules/
│       ├── Governance.js     # Original four-contract deployment
│       └── GuardDAO.js       # Complete six-contract GuardDAO deployment
├── scripts/
│   ├── sync-frontend-deployment.js # Sync addresses and compiled ABIs
│   ├── create-proposal.js    # CLI: submit a treasury-spend proposal
│   └── vote.js               # CLI: cast a vote on a proposal
├── test/
│   └── Governance.test.js    # Full lifecycle + edge case tests
├── hardhat.config.js
├── package.json
├── .env.example
├── LICENSE                   # MIT
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18.x
- **npm** or **yarn**
- A local Hardhat node for offline development; a Sepolia wallet is optional for testnet deployment

### Installation

```bash
git clone https://github.com/aishwaryaa9/GuardDAO GuardDAO
cd GuardDAO
npm install
```

### Environment Setup

Local development does not require `.env` or a private key. Testnet deployment needs separately configured credentials; never commit or share them.

---

## 🧪 Testing

```bash
# Compile
npx hardhat compile

# Run the full test suite
npx hardhat test

# With gas reporting
REPORT_GAS=true npx hardhat test

# Coverage
npx hardhat coverage

# Frontend service tests (IPFS evidence and audit data)
npm --prefix frontend test
```

The test suite covers:

- Token delegation and voting power activation
- Full happy-path proposal lifecycle (propose → vote → queue → execute)
- Governor target/selector allowlisting, including revalidation at execution
- Treasury recipient approvals, per-transfer caps, and elapsed-window limits
- Atomic Treasury-to-escrow funding, milestone release/refund paths, and reviewer authorization
- Reputation award authorization, duplicate protection, revocation, and separation from voting power
- Duplicate milestone refund regression protection
- Quorum failure (proposal defeated for insufficient turnout)
- Majority Against (proposal defeated)
- Unauthorized direct access to Treasury (must revert)
- Proposer below threshold (must revert)

---

## 🚢 Deployment with Hardhat Ignition

### Local

```bash
# Terminal 1: start a local Hardhat node and leave it running
npx hardhat node

# Terminal 2: deploy complete GuardDAO and synchronize frontend configuration
npm run deploy:guarddao
npm run sync:frontend

# Terminal 3: start the frontend
npm run frontend:dev
```

The original `npm run deploy:local` command deploys only the original four governance contracts. Neither local deployment is an upgrade; a fresh Hardhat node has fresh addresses, so synchronize frontend configuration after deployment.

### Sepolia Testnet

```bash
npm run deploy:sepolia
```

### Verify on Etherscan

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

Ignition handles deployment atomically:

1. Deploys `GovernanceToken` (mints full supply to deployer)
2. Deploys `DAOTimelock` (deployer is initial admin)
3. Deploys `DAOGovernor` (binds Token + Timelock)
4. Deploys `Treasury` (owned by Timelock)
5. Grants the Governor `PROPOSER_ROLE` on the Timelock
6. Grants `EXECUTOR_ROLE` to `address(0)` (anyone can execute after delay)
7. Renounces deployer's `DEFAULT_ADMIN_ROLE` (Timelock is now self-controlled)

---

## 💻 CLI Usage

### Create a Proposal (send ETH from Treasury)

```bash
GOVERNOR_ADDRESS=0xYourGovernor \
TREASURY_ADDRESS=0xYourTreasury \
RECIPIENT=0xRecipientAddress \
AMOUNT_ETH=2.5 \
REASON="Q1 ecosystem grant" \
npx hardhat run scripts/create-proposal.js --network sepolia
```

### Cast a Vote

```bash
GOVERNOR_ADDRESS=0xYourGovernor \
PROPOSAL_ID=0x... \
VOTE=for \
npx hardhat run scripts/vote.js --network sepolia
```

`VOTE` can be `for`, `against`, or `abstain`.

---

## 🔐 Security Considerations

- **OpenZeppelin 5 foundations** — Governor, TimelockController, and ERC20Votes are battle-tested and audited
- **Timelock isolation** — only the Timelock can call Treasury spend and policy functions
- **Action allowlist** — Governor proposal submission and execution both check the configured target/function selectors
- **Treasury guardrails** — approved recipients and per-asset spending caps are enforced at transfer time
- **Milestone escrow** — fixed allocations, independent reviewer approvals, and refund paths constrain staged ETH grants
- **Permissionless execution** — `EXECUTOR_ROLE` granted to `address(0)`, so anyone can execute approved proposals (prevents lockup)
- **Admin renounced** — deployer renounces `DEFAULT_ADMIN_ROLE` on the Timelock at deployment, so the system is fully decentralized
- **Vote-delegation required** — token holders must self-delegate before tokens count as voting power (prevents passive whale dominance)
- **Snapshot-based voting** — voting weight is locked at proposal creation block (prevents flash-loan governance attacks)
- **Solidity 0.8.x** — built-in overflow / underflow protection

### Trust Model

The system is trust-minimised after deployment:
- The Timelock controls the Treasury
- The Governor proposes to the Timelock
- The Governor responds only to majority + quorum of token holders
- No EOA has admin power once the deployer renounces

> ⚠️ This is a **reference implementation**. While built on audited OpenZeppelin primitives, the integration is not formally audited. Get a professional audit before mainnet deployment with material value.

---

## 📚 Tech Stack

- **Smart Contracts:** Solidity 0.8.27 compiler (contracts declare `^0.8.25`)
- **Framework:** Hardhat 2.22 + Hardhat Ignition 0.15
- **Libraries:** OpenZeppelin Contracts 5.0.2
- **Client:** Ethers.js 6
- **Testing:** Hardhat Toolbox · Chai Matchers · Hardhat Network Helpers
- **Network:** Ethereum (Sepolia / Mainnet)
- **Frontend tests:** Node.js test runner with `tsx` loader; service tests cover evidence integrity and audit event handling

---

## 📖 References

- [OpenZeppelin Governor Docs](https://docs.openzeppelin.com/contracts/5.x/governance)
- [Compound Governor Bravo](https://docs.compound.finance/v2/governance/)
- [Tally.xyz](https://www.tally.xyz/) — for governance UI on top of this stack
- [EIP-5805: Voting with Delegation](https://eips.ethereum.org/EIPS/eip-5805)

---


