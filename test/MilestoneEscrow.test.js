const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("GuardDAO milestone escrow and reputation", function () {
  let deployer, recipient, reviewer, outsider;
  let timelock, treasury, escrow, reputation;
  let awarderRole;
  let operationNonce = 0;

  async function executeThroughTimelock(targets, values, calldatas) {
    const salt = ethers.keccak256(ethers.toUtf8Bytes(`guarddao-test-${operationNonce++}`));
    await timelock.scheduleBatch(
      targets,
      values,
      calldatas,
      ethers.ZeroHash,
      salt,
      0
    );
    return timelock.executeBatch(targets, values, calldatas, ethers.ZeroHash, salt);
  }

  async function authorizeEscrow() {
    await executeThroughTimelock(
      [treasury, treasury],
      [0, 0],
      [
        treasury.interface.encodeFunctionData("setRecipientAllowed", [await escrow.getAddress(), true]),
        treasury.interface.encodeFunctionData("setAssetPolicy", [
          ethers.ZeroAddress,
          ethers.parseEther("3"),
          ethers.parseEther("10"),
          86400,
          true,
        ]),
      ]
    );
  }

  async function createFundedPlan(planId, amounts = [ethers.parseEther("1"), ethers.parseEther("2")]) {
    const total = amounts.reduce((sum, amount) => sum + amount, 0n);
    const deadlines = amounts.map((_, i) => BigInt(3600 * (i + 1)));
    const config = {
      planId,
      title: "Community research",
      recipient: recipient.address,
      reviewer: reviewer.address,
      fundingAmount: total,
      reviewPeriod: 3600,
      milestoneAmounts: amounts,
      submissionDeadlineOffsets: deadlines,
    };
    const fundingCall = treasury.interface.encodeFunctionData("disburseEth", [
      await escrow.getAddress(),
      total,
      "Approved milestone plan funding",
    ]);
    const planCall = escrow.interface.encodeFunctionData("createPlan", [config]);
    await executeThroughTimelock(
      [treasury, escrow],
      [0, 0],
      [fundingCall, planCall]
    );
    return config;
  }

  beforeEach(async function () {
    [deployer, recipient, reviewer, outsider] = await ethers.getSigners();

    const Timelock = await ethers.getContractFactory("DAOTimelock");
    timelock = await Timelock.deploy(0, [deployer.address], [deployer.address], deployer.address);

    const Treasury = await ethers.getContractFactory("Treasury");
    treasury = await Treasury.deploy(await timelock.getAddress());

    const Escrow = await ethers.getContractFactory("MilestoneEscrow");
    escrow = await Escrow.deploy(await timelock.getAddress(), await treasury.getAddress());

    const Reputation = await ethers.getContractFactory("DAOReputation");
    reputation = await Reputation.deploy(await timelock.getAddress(), await escrow.getAddress());
    awarderRole = await reputation.AWARDER_ROLE();

    await executeThroughTimelock(
      [escrow],
      [0],
      [escrow.interface.encodeFunctionData("setReputation", [
        await reputation.getAddress(),
      ])]
    );

    await authorizeEscrow();
    await deployer.sendTransaction({
      to: await treasury.getAddress(),
      value: ethers.parseEther("10"),
    });
  });

  it("funds a validated plan through Treasury and tracks staged releases", async function () {
    const planId = ethers.id("plan-one");
    const config = await createFundedPlan(planId);
    const plan = await escrow.getPlan(planId);

    expect(plan.fundingAmount).to.equal(config.fundingAmount);
    expect(plan.milestoneCount).to.equal(2);
    expect(await escrow.unallocatedFunding()).to.equal(0);
    expect(await treasury.ethBalance()).to.equal(ethers.parseEther("7"));
  });

  it("rejects plan creation by a non-Timelock caller", async function () {
    const config = {
      planId: ethers.id("unauthorized-plan"),
      title: "Unauthorized",
      recipient: recipient.address,
      reviewer: reviewer.address,
      fundingAmount: ethers.parseEther("1"),
      reviewPeriod: 3600,
      milestoneAmounts: [ethers.parseEther("1")],
      submissionDeadlineOffsets: [3600],
    };
    await expect(escrow.connect(outsider).createPlan(config))
      .to.be.revertedWithCustomError(escrow, "Unauthorized");
  });

  it("rejects mismatched milestone totals and atomically rolls back prior Treasury funding", async function () {
    const planId = ethers.id("invalid-total-plan");
    const latest = await ethers.provider.getBlock("latest");
    const config = {
      planId,
      title: "Invalid total",
      recipient: recipient.address,
      reviewer: reviewer.address,
      fundingAmount: ethers.parseEther("2"),
      reviewPeriod: 3600,
      milestoneAmounts: [ethers.parseEther("1")],
      submissionDeadlineOffsets: [3600],
    };
    const fundingCall = treasury.interface.encodeFunctionData("disburseEth", [
      await escrow.getAddress(),
      ethers.parseEther("2"),
      "Must roll back if plan creation fails",
    ]);
    const planCall = escrow.interface.encodeFunctionData("createPlan", [config]);

    await expect(executeThroughTimelock(
      [treasury, escrow],
      [0, 0],
      [fundingCall, planCall]
    )).to.be.revertedWithCustomError(escrow, "InvalidPlan");

    expect(await treasury.ethBalance()).to.equal(ethers.parseEther("10"));
    expect(await escrow.unallocatedFunding()).to.equal(0);
  });

  it("requires recipient evidence, independent reviewer approval, and only releases once", async function () {
    const planId = ethers.id("review-plan");
    await createFundedPlan(planId, [ethers.parseEther("1")]);

    await expect(escrow.connect(outsider).submitEvidence(planId, 0, "ipfs://evidence"))
      .to.be.revertedWithCustomError(escrow, "Unauthorized");
    await escrow.connect(recipient).submitEvidence(planId, 0, "ipfs://evidence");
    await expect(escrow.connect(recipient).approveMilestone(planId, 0))
      .to.be.revertedWithCustomError(escrow, "Unauthorized");

    await expect(escrow.connect(reviewer).approveMilestone(planId, 0))
      .to.emit(reputation, "ReputationAwarded")
      .withArgs(
        recipient.address,
        ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "bytes32", "uint256"],
            ["MILESTONE_COMPLETION", planId, 0]
          )
        ),
        0,
        100,
        await escrow.getAddress()
      );

    expect(await reputation.reputationOf(recipient.address)).to.equal(100);
    const balanceBefore = await ethers.provider.getBalance(recipient.address);
    await escrow.connect(outsider).releaseMilestone(planId, 0);
    expect((await ethers.provider.getBalance(recipient.address)) - balanceBefore)
      .to.equal(ethers.parseEther("1"));

    await expect(escrow.releaseMilestone(planId, 0))
      .to.be.revertedWithCustomError(escrow, "InvalidMilestone");
    expect((await escrow.getPlan(planId)).state).to.equal(1);
  });

  it("returns an expired unsubmitted milestone allocation to Treasury", async function () {
    const planId = ethers.id("expired-plan");
    const config = await createFundedPlan(planId, [ethers.parseEther("1")]);
    const milestone = await escrow.getMilestone(planId, 0);
    await time.increaseTo(milestone.submissionDeadline + 1n);

    await expect(escrow.refundMilestone(planId, 0))
      .to.emit(escrow, "MilestoneRefunded")
      .withArgs(planId, 0, ethers.parseEther("1"));

    expect(await treasury.ethBalance()).to.equal(ethers.parseEther("10"));
    expect((await escrow.getMilestone(planId, 0)).state).to.equal(5);
    expect((await escrow.getPlan(planId)).refundedAmount).to.equal(ethers.parseEther("1"));
  });

  it("refunds a rejected milestone and advances to the next allocation", async function () {
    const planId = ethers.id("rejected-plan");
    await createFundedPlan(planId, [ethers.parseEther("1"), ethers.parseEther("2")]);

    await escrow.connect(recipient).submitEvidence(planId, 0, "ipfs://incomplete-evidence");
    await escrow.connect(reviewer).rejectMilestone(planId, 0, "Evidence is incomplete");
    await escrow.connect(outsider).refundMilestone(planId, 0);

    expect((await escrow.getMilestone(planId, 0)).state).to.equal(5);
    expect((await escrow.getPlan(planId)).currentMilestone).to.equal(1);
    expect(await treasury.ethBalance()).to.equal(ethers.parseEther("8"));

    await escrow.connect(recipient).submitEvidence(planId, 1, "ipfs://completed-evidence");
    await escrow.connect(reviewer).approveMilestone(planId, 1);
    await escrow.connect(outsider).releaseMilestone(planId, 1);

    expect((await escrow.getPlan(planId)).state).to.equal(1);
    expect((await escrow.getPlan(planId)).releasedAmount).to.equal(ethers.parseEther("2"));
  });

  it("returns submitted allocations after the review deadline expires", async function () {
    const planId = ethers.id("expired-review-plan");
    await createFundedPlan(planId, [ethers.parseEther("1")]);
    await escrow.connect(recipient).submitEvidence(planId, 0, "ipfs://pending-review");
    const milestone = await escrow.getMilestone(planId, 0);
    await time.increaseTo(milestone.reviewDeadline + 1n);

    await expect(escrow.connect(outsider).refundMilestone(planId, 0))
      .to.emit(escrow, "MilestoneRefunded")
      .withArgs(planId, 0, ethers.parseEther("1"));

    expect(await treasury.ethBalance()).to.equal(ethers.parseEther("10"));
    expect((await escrow.getMilestone(planId, 0)).state).to.equal(5);
  });

  it("preserves released milestones and refunds remaining allocations after governed cancellation", async function () {
    const planId = ethers.id("cancelled-plan");
    await createFundedPlan(planId, [ethers.parseEther("1"), ethers.parseEther("2")]);
    await escrow.connect(recipient).submitEvidence(planId, 0, "ipfs://approved-evidence");
    await escrow.connect(reviewer).approveMilestone(planId, 0);
    await escrow.connect(outsider).releaseMilestone(planId, 0);

    await executeThroughTimelock(
      [escrow],
      [0],
      [escrow.interface.encodeFunctionData("cancelPlan", [planId])]
    );
    await escrow.connect(outsider).refundMilestone(planId, 1);

    const plan = await escrow.getPlan(planId);
    expect(plan.state).to.equal(2);
    expect(plan.releasedAmount).to.equal(ethers.parseEther("1"));
    expect(plan.refundedAmount).to.equal(ethers.parseEther("2"));
    expect(await treasury.ethBalance()).to.equal(ethers.parseEther("9"));
  });

  it("cannot refund the same cancelled allocation twice", async function () {
    const cancelledPlanId = ethers.id("repeated-refund-plan");
    const protectedPlanId = ethers.id("protected-plan");
    await createFundedPlan(cancelledPlanId, [ethers.parseEther("1")]);
    await createFundedPlan(protectedPlanId, [ethers.parseEther("1")]);
    await executeThroughTimelock(
      [escrow],
      [0],
      [escrow.interface.encodeFunctionData("cancelPlan", [cancelledPlanId])]
    );

    await escrow.connect(outsider).refundMilestone(cancelledPlanId, 0);
    await expect(escrow.connect(outsider).refundMilestone(cancelledPlanId, 0))
      .to.be.revertedWithCustomError(escrow, "InvalidState")
      .withArgs(5);

    expect((await escrow.getPlan(cancelledPlanId)).refundedAmount)
      .to.equal(ethers.parseEther("1"));
    expect((await escrow.getMilestone(protectedPlanId, 0)).state).to.equal(0);
    expect(await ethers.provider.getBalance(await escrow.getAddress()))
      .to.equal(ethers.parseEther("1"));
  });

  it("prevents duplicate reputation awards and does not expose transfer or approval methods", async function () {
    const contributionId = ethers.id("verified-review-1");
    await expect(reputation.connect(outsider).award(
      recipient.address,
      contributionId,
      2,
      25
    )).to.be.reverted;
    expect(reputation.interface.hasFunction("transfer")).to.equal(false);
    expect(reputation.interface.hasFunction("approve")).to.equal(false);

    await executeThroughTimelock(
      [reputation, reputation],
      [0, 0],
      [
        reputation.interface.encodeFunctionData("grantRole", [
          awarderRole,
          await timelock.getAddress(),
        ]),
        reputation.interface.encodeFunctionData("award", [
          recipient.address,
          contributionId,
          2,
          25,
        ]),
      ]
    );
    expect(await reputation.reputationOf(recipient.address)).to.equal(25);
    expect(await reputation.totalReputation()).to.equal(25);
    expect(await reputation.contributionRecorded(contributionId)).to.equal(true);

    await expect(executeThroughTimelock(
      [reputation],
      [0],
      [reputation.interface.encodeFunctionData("award", [
        recipient.address,
        contributionId,
        2,
        25,
      ])]
    )).to.be.revertedWithCustomError(reputation, "ContributionAlreadyRecorded");
  });

  it("allows revocation only through the Timelock and emits an auditable event", async function () {
    const contributionId = ethers.id("revocable-award");
    await executeThroughTimelock(
      [reputation, reputation],
      [0, 0],
      [
        reputation.interface.encodeFunctionData("grantRole", [
          awarderRole,
          await timelock.getAddress(),
        ]),
        reputation.interface.encodeFunctionData("award", [
          recipient.address,
          contributionId,
          1,
          40,
        ]),
      ]
    );

    await expect(reputation.connect(outsider).revoke(contributionId, "invalid proof"))
      .to.be.reverted;
    await expect(executeThroughTimelock(
      [reputation],
      [0],
      [reputation.interface.encodeFunctionData("revoke", [
        contributionId,
        "Contribution review overturned",
      ])]
    )).to.emit(reputation, "ReputationRevoked");

    expect(await reputation.reputationOf(recipient.address)).to.equal(0);
  });
});
