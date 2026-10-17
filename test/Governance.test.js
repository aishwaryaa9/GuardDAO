const { expect } = require("chai");
const { ethers } = require("hardhat");
const { mine, time } = require("@nomicfoundation/hardhat-network-helpers");

// Mirror of OpenZeppelin's Governor proposal states (for assertions)
const ProposalState = {
  Pending: 0,
  Active: 1,
  Canceled: 2,
  Defeated: 3,
  Succeeded: 4,
  Queued: 5,
  Expired: 6,
  Executed: 7,
};

// VoteType for GovernorCountingSimple
const VoteType = { Against: 0, For: 1, Abstain: 2 };

const MIN_DELAY = 60 * 60 * 24; // 1 day timelock delay
const VOTING_DELAY = 1;          // 1 block
const VOTING_PERIOD = 50_400;    // ~1 week at 12s blocks

async function executeGovernanceBatch(governor, voter, targets, values, calldatas, description) {
  const descriptionHash = ethers.id(description);
  await (await governor.connect(voter).propose(targets, values, calldatas, description)).wait();
  const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);
  await mine(VOTING_DELAY + 1);
  await (await governor.connect(voter).castVote(proposalId, VoteType.For)).wait();
  await mine(VOTING_PERIOD + 1);
  await (await governor.queue(targets, values, calldatas, descriptionHash)).wait();
  await time.increase(MIN_DELAY + 1);
  await (await governor.execute(targets, values, calldatas, descriptionHash)).wait();
}

describe("GuardDAO Governance", function () {
  let token, timelock, governor, treasury;
  let escrow, reputation;
  let deployer, voter1, voter2, voter3, recipient;
  let proposerRole, executorRole, adminRole;

  beforeEach(async function () {
    [deployer, voter1, voter2, voter3, recipient] = await ethers.getSigners();

    // 1. Deploy governance token
    const Token = await ethers.getContractFactory("GovernanceToken");
    token = await Token.deploy(deployer.address);

    // 2. Deploy timelock with no initial proposers/executors (we wire them after)
    const Timelock = await ethers.getContractFactory("DAOTimelock");
    timelock = await Timelock.deploy(MIN_DELAY, [], [], deployer.address);

    // 3. Deploy treasury with conservative spending limits and no approved recipients.
    const Treasury = await ethers.getContractFactory("Treasury");
    treasury = await Treasury.deploy(await timelock.getAddress());

    // 4. Deploy escrow and non-transferable reputation modules.
    const Escrow = await ethers.getContractFactory("MilestoneEscrow");
    escrow = await Escrow.deploy(await timelock.getAddress(), await treasury.getAddress());
    const Reputation = await ethers.getContractFactory("DAOReputation");
    reputation = await Reputation.deploy(await timelock.getAddress(), await escrow.getAddress());

    // 5. Allow only the actions required by this test governance deployment.
    const allowedTargets = [
      await treasury.getAddress(),
      await escrow.getAddress(),
      await reputation.getAddress(),
    ];
    const allowedSelectors = [
      [
        treasury.interface.getFunction("disburseEth").selector,
        treasury.interface.getFunction("disburseToken").selector,
        treasury.interface.getFunction("setAssetPolicy").selector,
        treasury.interface.getFunction("setRecipientAllowed").selector,
      ],
      [
        escrow.interface.getFunction("createPlan").selector,
        escrow.interface.getFunction("setReputation").selector,
        escrow.interface.getFunction("cancelPlan").selector,
      ],
      [
        reputation.interface.getFunction("grantRole").selector,
        reputation.interface.getFunction("revoke").selector,
      ],
    ];
    const Governor = await ethers.getContractFactory("DAOGovernor");
    governor = await Governor.deploy(
      await token.getAddress(),
      await timelock.getAddress(),
      allowedTargets,
      allowedSelectors
    );

    // 6. Wire up roles: Governor can propose, anyone can execute
    proposerRole = await timelock.PROPOSER_ROLE();
    executorRole = await timelock.EXECUTOR_ROLE();
    adminRole = await timelock.DEFAULT_ADMIN_ROLE();

    await timelock.grantRole(proposerRole, await governor.getAddress());
    await timelock.grantRole(executorRole, ethers.ZeroAddress); // open execution
    await timelock.renounceRole(adminRole, deployer.address);   // renounce admin so only Timelock self-controls

    // 7. Distribute tokens to voters & self-delegate so voting power activates
    await token.transfer(voter1.address, ethers.parseEther("300000"));
    await token.transfer(voter2.address, ethers.parseEther("200000"));
    await token.transfer(voter3.address, ethers.parseEther("100000"));

    await token.connect(deployer).delegate(deployer.address);
    await token.connect(voter1).delegate(voter1.address);
    await token.connect(voter2).delegate(voter2.address);
    await token.connect(voter3).delegate(voter3.address);

    // Configure the recipient and escrow policies through governance.
    await executeGovernanceBatch(
      governor,
      deployer,
      [
        await treasury.getAddress(),
        await treasury.getAddress(),
        await treasury.getAddress(),
        await escrow.getAddress(),
      ],
      [0, 0, 0, 0],
      [
        treasury.interface.encodeFunctionData("setRecipientAllowed", [recipient.address, true]),
        treasury.interface.encodeFunctionData("setAssetPolicy", [
          ethers.ZeroAddress,
          ethers.parseEther("3"),
          ethers.parseEther("5"),
          86400,
          true,
        ]),
        treasury.interface.encodeFunctionData("setRecipientAllowed", [
          await escrow.getAddress(),
          true,
        ]),
        escrow.interface.encodeFunctionData("setReputation", [
          await reputation.getAddress(),
        ]),
      ],
      "Initialize treasury, milestone escrow, and reputation policies for tests"
    );
  });

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------
  describe("Initial setup", function () {
    it("mints the full initial supply to the deployer", async function () {
      expect(await token.balanceOf(deployer.address)).to.equal(
        ethers.parseEther("400000") // 1M total - 300k - 200k - 100k = 400k remaining
      );
    });

    it("configures the governor correctly", async function () {
      expect(await governor.votingDelay()).to.equal(VOTING_DELAY);
      expect(await governor.votingPeriod()).to.equal(VOTING_PERIOD);
      expect(await governor.proposalThreshold()).to.equal(ethers.parseEther("1"));
      expect(await governor.name()).to.equal("DAOGovernor");
    });

    it("makes the timelock the treasury owner", async function () {
      expect(await treasury.owner()).to.equal(await timelock.getAddress());
    });

    it("grants the Governor the PROPOSER role on the Timelock", async function () {
      expect(await timelock.hasRole(proposerRole, await governor.getAddress())).to.equal(true);
    });
  });

  // -------------------------------------------------------------------------
  // Token & voting power
  // -------------------------------------------------------------------------
  describe("Token & voting power", function () {
    it("requires self-delegation to count voting power", async function () {
      const [, , , , , fresh] = await ethers.getSigners();
      await token.transfer(fresh.address, ethers.parseEther("100"));
      expect(await token.getVotes(fresh.address)).to.equal(0); // no delegation yet
      await token.connect(fresh).delegate(fresh.address);
      // Move one block forward so checkpoint registers
      await mine(1);
      expect(await token.getVotes(fresh.address)).to.equal(ethers.parseEther("100"));
    });
  });

  describe("Risk-aware treasury guardrails", function () {
    it("permits each withdrawal at the transaction limit and enforces the cumulative window limit", async function () {
      const amountA = ethers.parseEther("3");
      const amountB = ethers.parseEther("2");
      const targets = [await treasury.getAddress(), await treasury.getAddress()];
      const values = [0, 0];
      const calldatas = [
        treasury.interface.encodeFunctionData("disburseEth", [
          recipient.address,
          amountA,
          "first bounded grant",
        ]),
        treasury.interface.encodeFunctionData("disburseEth", [
          recipient.address,
          amountB,
          "second bounded grant",
        ]),
      ];

      await deployer.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("6"),
      });
      await executeGovernanceBatch(
        governor,
        deployer,
        targets,
        values,
        calldatas,
        "Execute withdrawals up to the policy window limit"
      );

      expect(await treasury.ethBalance()).to.equal(ethers.parseEther("1"));
      expect(await treasury.checkSpend(
        ethers.ZeroAddress,
        recipient.address,
        ethers.parseEther("1")
      )).to.equal(5);
    });

    it("reports an unapproved destination and an amount above the transaction limit", async function () {
      const [, , , , , unapprovedRecipient] = await ethers.getSigners();
      expect(await treasury.checkSpend(
        ethers.ZeroAddress,
        unapprovedRecipient.address,
        ethers.parseEther("1")
      )).to.equal(3);
      expect(await treasury.checkSpend(
        ethers.ZeroAddress,
        recipient.address,
        ethers.parseEther("3.000000000000000001")
      )).to.equal(4);
      expect(await treasury.checkSpend(
        ethers.ZeroAddress,
        recipient.address,
        ethers.parseEther("3")
      )).to.equal(0);
    });

    it("rejects spending above the transaction cap during Governor execution", async function () {
      await deployer.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("5"),
      });
      const targets = [await treasury.getAddress()];
      const values = [0];
      const calldatas = [
        treasury.interface.encodeFunctionData("disburseEth", [
          recipient.address,
          ethers.parseEther("3.000000000000000001"),
          "over-limit grant",
        ]),
      ];

      await expect(executeGovernanceBatch(
        governor,
        deployer,
        targets,
        values,
        calldatas,
        "Attempt a grant above the per-transaction limit"
      )).to.be.revertedWithCustomError(treasury, "SpendNotPermitted").withArgs(4);
      expect(await treasury.ethBalance()).to.equal(ethers.parseEther("5"));
    });

    it("rejects a proposal targeting a contract function outside the allowlist", async function () {
      await expect(
        governor.connect(deployer).propose(
          [recipient.address],
          [0],
          ["0x12345678"],
          "Call an unapproved target"
        )
      ).to.be.revertedWithCustomError(governor, "DisallowedProposalCall");
    });

    it("does not allow direct policy changes outside the Timelock", async function () {
      await expect(
        treasury.connect(deployer).setAssetPolicy(
          ethers.ZeroAddress,
          ethers.parseEther("2"),
          ethers.parseEther("4"),
          86400,
          true
        )
      ).to.be.reverted;
    });

    it("requires governance to extend the function allowlist", async function () {
      const selector = "0x12345678";
      await expect(
        governor.setAllowedCall(recipient.address, selector, true)
      ).to.be.reverted;

      await executeGovernanceBatch(
        governor,
        deployer,
        [await governor.getAddress()],
        [0],
        [governor.interface.encodeFunctionData("setAllowedCall", [
          recipient.address,
          selector,
          true,
        ])],
        "Governance adds an explicitly reviewed call"
      );
      expect(await governor.allowedCalls(recipient.address, selector)).to.equal(true);
    });

    it("rejects an otherwise allowlisted selector when the call attaches ETH", async function () {
      await expect(
        governor.connect(deployer).propose(
          [await treasury.getAddress()],
          [1],
          [treasury.interface.encodeFunctionData("setRecipientAllowed", [
            recipient.address,
            true,
          ])],
          "Attach ETH to a nonpayable policy call"
        )
      ).to.be.revertedWithCustomError(governor, "DisallowedProposalCall");
    });

    it("rejects spending to an unapproved destination during Governor execution", async function () {
      const [, , , , , unapproved] = await ethers.getSigners();
      await deployer.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("2"),
      });
      const targets = [await treasury.getAddress()];
      const values = [0];
      const calldatas = [treasury.interface.encodeFunctionData("disburseEth", [
        unapproved.address,
        ethers.parseEther("1"),
        "unapproved destination",
      ])];

      await expect(executeGovernanceBatch(
        governor,
        deployer,
        targets,
        values,
        calldatas,
        "Attempt an unapproved treasury payout"
      )).to.be.revertedWithCustomError(treasury, "SpendNotPermitted").withArgs(3);
      expect(await treasury.ethBalance()).to.equal(ethers.parseEther("2"));
    });

    it("enforces ERC-20 spending policies in token base units", async function () {
      const tokenAddress = await token.getAddress();
      const cap = ethers.parseEther("10");
      const totalCap = ethers.parseEther("20");
      await executeGovernanceBatch(
        governor,
        deployer,
        [await treasury.getAddress()],
        [0],
        [treasury.interface.encodeFunctionData("setAssetPolicy", [
          tokenAddress,
          cap,
          totalCap,
          86400,
          true,
        ])],
        "Configure a GOV-token treasury spend policy"
      );
      await token.transfer(await treasury.getAddress(), ethers.parseEther("20"));

      await executeGovernanceBatch(
        governor,
        deployer,
        [await treasury.getAddress()],
        [0],
        [treasury.interface.encodeFunctionData("disburseToken", [
          tokenAddress,
          recipient.address,
          cap,
          "Exact token policy cap",
        ])],
        "Transfer GOV at the exact configured limit"
      );
      expect(await treasury.tokenBalance(tokenAddress)).to.equal(ethers.parseEther("10"));
      expect(await treasury.checkSpend(
        tokenAddress,
        recipient.address,
        ethers.parseEther("10.000000000000000001")
      )).to.equal(4);
    });
  });

  describe("Governed milestone and reputation integration", function () {
    it("funds escrow, approves a milestone, releases funds, and awards separate reputation", async function () {
      const planId = ethers.id("governed-milestone");
      const fundingAmount = ethers.parseEther("1");
      await deployer.sendTransaction({
        to: await treasury.getAddress(),
        value: fundingAmount,
      });
      const config = {
        planId,
        title: "Governance-approved delivery",
        recipient: voter2.address,
        reviewer: voter3.address,
        fundingAmount,
        reviewPeriod: 3600,
        milestoneAmounts: [fundingAmount],
        submissionDeadlineOffsets: [86400],
      };
      const calldata = [
        treasury.interface.encodeFunctionData("disburseEth", [
          await escrow.getAddress(),
          fundingAmount,
          "Fund approved milestone escrow",
        ]),
        escrow.interface.encodeFunctionData("createPlan", [config]),
      ];
      await executeGovernanceBatch(
        governor,
        deployer,
        [await treasury.getAddress(), await escrow.getAddress()],
        [0, 0],
        calldata,
        "Fund a one-stage verified deliverable"
      );

      await escrow.connect(voter2).submitEvidence(planId, 0, "ipfs://verified-deliverable-reference");
      await escrow.connect(voter3).approveMilestone(planId, 0);
      expect(await reputation.reputationOf(voter2.address)).to.equal(100);

      const before = await ethers.provider.getBalance(voter2.address);
      await escrow.connect(voter1).releaseMilestone(planId, 0);
      expect((await ethers.provider.getBalance(voter2.address)) - before).to.equal(fundingAmount);
      expect(await token.getVotes(voter2.address)).to.equal(ethers.parseEther("200000"));
      expect((await escrow.getPlan(planId)).state).to.equal(1);
    });
  });

  // -------------------------------------------------------------------------
  // Happy-path proposal lifecycle
  // -------------------------------------------------------------------------
  describe("Full proposal lifecycle (happy path)", function () {
    it("creates, votes on, queues, and executes a proposal that spends treasury ETH", async function () {
      // Fund the treasury with 10 ETH
      await deployer.sendTransaction({ to: await treasury.getAddress(), value: ethers.parseEther("10") });
      expect(await treasury.ethBalance()).to.equal(ethers.parseEther("10"));

      const recipientBefore = await ethers.provider.getBalance(recipient.address);

      // ---- Build the proposal ----
      const targets = [await treasury.getAddress()];
      const values = [0];
      const grantAmount = ethers.parseEther("2.5");
      const calldatas = [
        treasury.interface.encodeFunctionData("disburseEth", [
          recipient.address,
          grantAmount,
          "Grant for proposal #1: ecosystem incentives",
        ]),
      ];
      const description = "Proposal #1: Send 2.5 ETH to recipient for ecosystem incentives";
      const descriptionHash = ethers.id(description);

      // ---- Propose ----
      const proposeTx = await governor.connect(voter1).propose(targets, values, calldatas, description);
      const proposeReceipt = await proposeTx.wait();
      const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);

      expect(await governor.state(proposalId)).to.equal(ProposalState.Pending);

      // ---- Advance past voting delay ----
      await mine(VOTING_DELAY + 1);
      expect(await governor.state(proposalId)).to.equal(ProposalState.Active);

      // ---- Cast votes ----
      await governor.connect(deployer).castVote(proposalId, VoteType.For);
      await governor.connect(voter1).castVote(proposalId, VoteType.For);
      await governor.connect(voter2).castVote(proposalId, VoteType.For);
      await governor.connect(voter3).castVote(proposalId, VoteType.Against);

      // ---- Advance past voting period ----
      await mine(VOTING_PERIOD + 1);
      expect(await governor.state(proposalId)).to.equal(ProposalState.Succeeded);

      // ---- Queue ----
      await governor.queue(targets, values, calldatas, descriptionHash);
      expect(await governor.state(proposalId)).to.equal(ProposalState.Queued);

      // ---- Fast-forward past timelock delay ----
      await time.increase(MIN_DELAY + 1);

      // ---- Execute ----
      await governor.execute(targets, values, calldatas, descriptionHash);
      expect(await governor.state(proposalId)).to.equal(ProposalState.Executed);

      // ---- Verify recipient received the funds ----
      const recipientAfter = await ethers.provider.getBalance(recipient.address);
      expect(recipientAfter - recipientBefore).to.equal(grantAmount);
      expect(await treasury.ethBalance()).to.equal(ethers.parseEther("7.5"));
    });
  });

  // -------------------------------------------------------------------------
  // Failure & edge cases
  // -------------------------------------------------------------------------
  describe("Failure cases", function () {
    it("defeats a proposal that doesn't reach quorum", async function () {
      const targets = [await treasury.getAddress()];
      const values = [0];
      const calldatas = [
        treasury.interface.encodeFunctionData("disburseEth", [
          recipient.address,
          ethers.parseEther("1"),
          "small grant",
        ]),
      ];
      const description = "Proposal: small grant (quorum test)";
      const descriptionHash = ethers.id(description);

      await governor.connect(voter1).propose(targets, values, calldatas, description);
      const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);

      await mine(VOTING_DELAY + 1);

      // Quorum is 4% of 1M = 40k tokens. voter3 has only 100k tokens For,
      // but quorum counts For + Abstain on this proposal. Have voter3 abstain only — that DOES count,
      // and 100k > 40k so quorum passes. Instead, use a proposer who didn't delegate.
      // Easier: nobody votes. State after voting period = Defeated.
      await mine(VOTING_PERIOD + 1);
      expect(await governor.state(proposalId)).to.equal(ProposalState.Defeated);
    });

    it("defeats a proposal where Against outweighs For", async function () {
      const targets = [await treasury.getAddress()];
      const values = [0];
      const calldatas = [
        treasury.interface.encodeFunctionData("disburseEth", [
          recipient.address,
          ethers.parseEther("1"),
          "rejected grant",
        ]),
      ];
      const description = "Proposal: rejected grant";
      const descriptionHash = ethers.id(description);

      await governor.connect(voter1).propose(targets, values, calldatas, description);
      const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);

      await mine(VOTING_DELAY + 1);

      // 300k Against (voter1), 200k Against (voter2), 100k For (voter3)
      await governor.connect(voter1).castVote(proposalId, VoteType.Against);
      await governor.connect(voter2).castVote(proposalId, VoteType.Against);
      await governor.connect(voter3).castVote(proposalId, VoteType.For);

      await mine(VOTING_PERIOD + 1);
      expect(await governor.state(proposalId)).to.equal(ProposalState.Defeated);
    });

    it("reverts if non-owner tries to call Treasury.disburseEth directly", async function () {
      await deployer.sendTransaction({ to: await treasury.getAddress(), value: ethers.parseEther("1") });
      await expect(
        treasury.connect(deployer).disburseEth(recipient.address, ethers.parseEther("0.1"), "bypass attempt")
      ).to.be.reverted;
    });

    it("reverts if a proposer below threshold tries to propose", async function () {
      const [, , , , , noTokens] = await ethers.getSigners();
      const targets = [await treasury.getAddress()];
      const values = [0];
      const calldatas = [
        treasury.interface.encodeFunctionData("disburseEth", [
          recipient.address,
          ethers.parseEther("1"),
          "bad proposer",
        ]),
      ];
      const description = "Proposal: from a voter with zero tokens";

      await expect(
        governor.connect(noTokens).propose(targets, values, calldatas, description)
      ).to.be.reverted;
    });
  });
});
