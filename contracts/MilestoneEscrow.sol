// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DAOReputation} from "./DAOReputation.sol";

/**
 * @title MilestoneEscrow
 * @notice Holds Treasury-funded ETH and releases fixed milestone allocations
 *         only after an assigned reviewer approves submitted evidence.
 */
contract MilestoneEscrow is ReentrancyGuard {
    uint256 public constant MAX_MILESTONES = 20;
    uint256 public constant MILESTONE_REPUTATION_POINTS = 100;
    uint256 public constant MAX_TITLE_LENGTH = 128;
    uint256 public constant MAX_EVIDENCE_LENGTH = 512;

    enum PlanState {
        Funded,
        Completed,
        Cancelled
    }

    enum MilestoneState {
        Pending,
        Submitted,
        Approved,
        Rejected,
        Released,
        Refunded
    }

    struct Plan {
        string title;
        address recipient;
        address reviewer;
        uint256 fundingAmount;
        uint256 releasedAmount;
        uint256 refundedAmount;
        uint64 reviewPeriod;
        uint256 currentMilestone;
        uint256 milestoneCount;
        PlanState state;
        bool exists;
    }

    struct Milestone {
        uint256 amount;
        uint64 submissionDeadline;
        uint64 reviewDeadline;
        MilestoneState state;
        string evidenceReference;
    }

    struct PlanConfig {
        bytes32 planId;
        string title;
        address recipient;
        address reviewer;
        uint256 fundingAmount;
        uint64 reviewPeriod;
        uint256[] milestoneAmounts;
        uint64[] submissionDeadlineOffsets;
    }

    address public immutable timelock;
    address public immutable treasury;
    DAOReputation public reputation;

    mapping(bytes32 planId => Plan plan) private plans;
    mapping(bytes32 planId => Milestone[] milestones) private planMilestones;
    bytes32[] private planIds;
    uint256 public unallocatedFunding;

    error Unauthorized();
    error InvalidPlan();
    error PlanAlreadyExists(bytes32 planId);
    error PlanNotFound(bytes32 planId);
    error InvalidMilestone(uint256 index);
    error InvalidState(MilestoneState state);
    error DeadlinePassed();
    error DeadlineNotPassed();
    error FundingUnavailable();
    error ReputationNotConfigured();
    error ReputationAlreadyConfigured();
    error TransferFailed();

    event EscrowFunded(uint256 amount, uint256 totalUnallocated);
    event ReputationConfigured(address indexed reputation);
    event PlanCreated(
        bytes32 indexed planId,
        address indexed recipient,
        address indexed reviewer,
        uint256 amount,
        uint256 milestoneCount
    );
    event MilestoneSubmitted(
        bytes32 indexed planId,
        uint256 indexed milestoneIndex,
        string evidenceReference,
        uint64 reviewDeadline
    );
    event MilestoneApproved(
        bytes32 indexed planId,
        uint256 indexed milestoneIndex,
        address indexed reviewer,
        bytes32 contributionId
    );
    event MilestoneRejected(
        bytes32 indexed planId,
        uint256 indexed milestoneIndex,
        address indexed reviewer,
        string reason
    );
    event MilestoneReleased(
        bytes32 indexed planId,
        uint256 indexed milestoneIndex,
        address indexed recipient,
        uint256 amount
    );
    event MilestoneRefunded(
        bytes32 indexed planId,
        uint256 indexed milestoneIndex,
        uint256 amount
    );
    event PlanCancelled(bytes32 indexed planId);

    modifier onlyTimelock() {
        if (msg.sender != timelock) revert Unauthorized();
        _;
    }

    constructor(address timelock_, address treasury_) {
        if (timelock_ == address(0) || treasury_ == address(0)) revert InvalidPlan();
        timelock = timelock_;
        treasury = treasury_;
    }

    /// @notice Treasury sends funds only as part of a Governor/Timelock action.
    receive() external payable {
        if (msg.sender != treasury || msg.value == 0) revert Unauthorized();
        unallocatedFunding += msg.value;
        emit EscrowFunded(msg.value, unallocatedFunding);
    }

    /// @notice Link the reputation ledger once through a governed Timelock call.
    function setReputation(address reputation_) external onlyTimelock {
        if (address(reputation) != address(0)) revert ReputationAlreadyConfigured();
        if (reputation_ == address(0)) revert InvalidPlan();
        reputation = DAOReputation(reputation_);
        emit ReputationConfigured(reputation_);
    }

    /**
     * @notice Register a fully funded plan. In an authorized Governor batch,
     *         Treasury funding must precede this call, so failure reverts both.
     */
    function createPlan(PlanConfig calldata config) external onlyTimelock {
        uint256 count = config.milestoneAmounts.length;
        if (
            config.planId == bytes32(0) || bytes(config.title).length == 0
                || bytes(config.title).length > MAX_TITLE_LENGTH || config.recipient == address(0)
                || config.reviewer == address(0) || config.reviewer == config.recipient
                || config.fundingAmount == 0 || count == 0 || count > MAX_MILESTONES
                || count != config.submissionDeadlineOffsets.length || config.reviewPeriod == 0
                || config.fundingAmount > unallocatedFunding
        ) {
            revert InvalidPlan();
        }
        if (plans[config.planId].exists) revert PlanAlreadyExists(config.planId);

        uint256 total;
        uint64 previousDeadline;
        for (uint256 i; i < count; ++i) {
            uint256 amount = config.milestoneAmounts[i];
            uint64 deadlineOffset = config.submissionDeadlineOffsets[i];
            if (
                amount == 0 || deadlineOffset == 0
                    || uint256(deadlineOffset) > type(uint64).max - block.timestamp
                    || (i > 0 && deadlineOffset <= previousDeadline)
            ) {
                revert InvalidMilestone(i);
            }
            total += amount;
            previousDeadline = deadlineOffset;
        }
        if (total != config.fundingAmount) revert InvalidPlan();

        unallocatedFunding -= config.fundingAmount;
        Plan storage plan = plans[config.planId];
        planIds.push(config.planId);
        plan.title = config.title;
        plan.recipient = config.recipient;
        plan.reviewer = config.reviewer;
        plan.fundingAmount = config.fundingAmount;
        plan.reviewPeriod = config.reviewPeriod;
        plan.milestoneCount = count;
        plan.state = PlanState.Funded;
        plan.exists = true;

        for (uint256 i; i < count; ++i) {
            planMilestones[config.planId].push(
                Milestone({
                    amount: config.milestoneAmounts[i],
                    submissionDeadline: uint64(block.timestamp + config.submissionDeadlineOffsets[i]),
                    reviewDeadline: 0,
                    state: MilestoneState.Pending,
                    evidenceReference: ""
                })
            );
        }

        emit PlanCreated(
            config.planId,
            config.recipient,
            config.reviewer,
            config.fundingAmount,
            count
        );
    }

    function submitEvidence(bytes32 planId, uint256 milestoneIndex, string calldata evidenceReference)
        external
    {
        Plan storage plan = _getPlan(planId);
        Milestone storage milestone = _getMilestone(planId, milestoneIndex);
        if (msg.sender != plan.recipient) revert Unauthorized();
        if (plan.state != PlanState.Funded || milestoneIndex != plan.currentMilestone) {
            revert InvalidMilestone(milestoneIndex);
        }
        if (milestone.state != MilestoneState.Pending) revert InvalidState(milestone.state);
        if (block.timestamp > milestone.submissionDeadline) revert DeadlinePassed();
        if (bytes(evidenceReference).length == 0 || bytes(evidenceReference).length > MAX_EVIDENCE_LENGTH) {
            revert InvalidPlan();
        }

        uint256 reviewDeadline = block.timestamp + plan.reviewPeriod;
        if (reviewDeadline > type(uint64).max) revert InvalidPlan();
        milestone.reviewDeadline = uint64(reviewDeadline);
        milestone.evidenceReference = evidenceReference;
        milestone.state = MilestoneState.Submitted;

        emit MilestoneSubmitted(
            planId,
            milestoneIndex,
            evidenceReference,
            milestone.reviewDeadline
        );
    }

    function approveMilestone(bytes32 planId, uint256 milestoneIndex) external {
        Plan storage plan = _getPlan(planId);
        Milestone storage milestone = _getMilestone(planId, milestoneIndex);
        if (msg.sender != plan.reviewer) revert Unauthorized();
        if (milestone.state != MilestoneState.Submitted) revert InvalidState(milestone.state);
        if (block.timestamp > milestone.reviewDeadline) revert DeadlinePassed();
        if (address(reputation) == address(0)) revert ReputationNotConfigured();

        bytes32 contributionId = keccak256(abi.encode("MILESTONE_COMPLETION", planId, milestoneIndex));
        milestone.state = MilestoneState.Approved;
        reputation.award(
            plan.recipient,
            contributionId,
            DAOReputation.Category.MilestoneCompletion,
            MILESTONE_REPUTATION_POINTS
        );

        emit MilestoneApproved(planId, milestoneIndex, msg.sender, contributionId);
    }

    function rejectMilestone(bytes32 planId, uint256 milestoneIndex, string calldata reason) external {
        Plan storage plan = _getPlan(planId);
        Milestone storage milestone = _getMilestone(planId, milestoneIndex);
        if (msg.sender != plan.reviewer) revert Unauthorized();
        if (milestone.state != MilestoneState.Submitted) revert InvalidState(milestone.state);
        if (block.timestamp > milestone.reviewDeadline) revert DeadlinePassed();

        milestone.state = MilestoneState.Rejected;
        emit MilestoneRejected(planId, milestoneIndex, msg.sender, reason);
    }

    /// @notice Anyone may trigger release, but funds always go to the fixed recipient.
    function releaseMilestone(bytes32 planId, uint256 milestoneIndex) external nonReentrant {
        Plan storage plan = _getPlan(planId);
        Milestone storage milestone = _getMilestone(planId, milestoneIndex);
        if (plan.state != PlanState.Funded || milestoneIndex != plan.currentMilestone) {
            revert InvalidMilestone(milestoneIndex);
        }
        if (milestone.state != MilestoneState.Approved) revert InvalidState(milestone.state);

        milestone.state = MilestoneState.Released;
        plan.releasedAmount += milestone.amount;
        _advancePlan(plan, milestoneIndex);

        (bool success,) = payable(plan.recipient).call{value: milestone.amount}("");
        if (!success) revert TransferFailed();

        emit MilestoneReleased(planId, milestoneIndex, plan.recipient, milestone.amount);
    }

    /**
     * @notice Return an unearned allocation to Treasury after rejection,
     *         expiry, or cancellation. Approved allocations are never refundable.
     */
    function refundMilestone(bytes32 planId, uint256 milestoneIndex) external nonReentrant {
        Plan storage plan = _getPlan(planId);
        Milestone storage milestone = _getMilestone(planId, milestoneIndex);
        if (
            milestone.state == MilestoneState.Approved
                || milestone.state == MilestoneState.Released
                || milestone.state == MilestoneState.Refunded
        ) {
            revert InvalidState(milestone.state);
        }

        bool cancelled = plan.state == PlanState.Cancelled;
        bool rejected = milestone.state == MilestoneState.Rejected;
        bool submissionExpired = milestone.state == MilestoneState.Pending
            && block.timestamp > milestone.submissionDeadline;
        bool reviewExpired = milestone.state == MilestoneState.Submitted
            && block.timestamp > milestone.reviewDeadline;
        if (!cancelled && !rejected && !submissionExpired && !reviewExpired) {
            revert DeadlineNotPassed();
        }

        milestone.state = MilestoneState.Refunded;
        plan.refundedAmount += milestone.amount;
        _advancePlan(plan, milestoneIndex);

        (bool success,) = payable(treasury).call{value: milestone.amount}("");
        if (!success) revert TransferFailed();

        emit MilestoneRefunded(planId, milestoneIndex, milestone.amount);
    }

    /// @notice Timelock may cancel; released and approved allocations remain committed.
    function cancelPlan(bytes32 planId) external onlyTimelock {
        Plan storage plan = _getPlan(planId);
        if (plan.state != PlanState.Funded) revert InvalidPlan();
        if (
            plan.currentMilestone < plan.milestoneCount
                && planMilestones[planId][plan.currentMilestone].state == MilestoneState.Approved
        ) {
            revert InvalidState(MilestoneState.Approved);
        }
        plan.state = PlanState.Cancelled;
        emit PlanCancelled(planId);
    }

    function getPlan(bytes32 planId) external view returns (Plan memory) {
        return _getPlan(planId);
    }

    function getMilestone(bytes32 planId, uint256 milestoneIndex)
        external
        view
        returns (Milestone memory)
    {
        return _getMilestone(planId, milestoneIndex);
    }

    function planCount() external view returns (uint256) {
        return planIds.length;
    }

    function planIdAt(uint256 index) external view returns (bytes32) {
        if (index >= planIds.length) revert InvalidPlan();
        return planIds[index];
    }

    function _getPlan(bytes32 planId) private view returns (Plan storage plan) {
        plan = plans[planId];
        if (!plan.exists) revert PlanNotFound(planId);
    }

    function _getMilestone(bytes32 planId, uint256 milestoneIndex)
        private
        view
        returns (Milestone storage milestone)
    {
        Plan storage plan = _getPlan(planId);
        if (milestoneIndex >= plan.milestoneCount) revert InvalidMilestone(milestoneIndex);
        milestone = planMilestones[planId][milestoneIndex];
    }

    function _advancePlan(Plan storage plan, uint256 milestoneIndex) private {
        if (plan.currentMilestone != milestoneIndex) return;
        plan.currentMilestone++;
        if (plan.currentMilestone == plan.milestoneCount && plan.state == PlanState.Funded) {
            plan.state = PlanState.Completed;
        }
    }
}
