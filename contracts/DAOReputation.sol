// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title DAOReputation
 * @notice Non-transferable contribution points, intentionally separate from GOV voting power.
 */
contract DAOReputation is AccessControl {
    bytes32 public constant AWARDER_ROLE = keccak256("AWARDER_ROLE");

    enum Category {
        MilestoneCompletion,
        VerifiedContribution,
        ReviewParticipation
    }

    struct Award {
        address recipient;
        uint256 points;
        Category category;
        bool active;
    }

    mapping(address account => uint256 points) public reputationOf;
    mapping(bytes32 contributionId => Award award) public awards;
    mapping(bytes32 contributionId => bool recorded) public contributionRecorded;
    uint256 public totalReputation;

    error InvalidAward();
    error ContributionAlreadyRecorded(bytes32 contributionId);
    error AwardNotActive(bytes32 contributionId);

    event ReputationAwarded(
        address indexed recipient,
        bytes32 indexed contributionId,
        Category category,
        uint256 points,
        address indexed awarder
    );
    event ReputationRevoked(
        address indexed recipient,
        bytes32 indexed contributionId,
        uint256 points,
        string reason,
        address indexed revoker
    );

    constructor(address timelock, address initialAwarder) {
        if (timelock == address(0) || initialAwarder == address(0)) revert InvalidAward();
        _grantRole(DEFAULT_ADMIN_ROLE, timelock);
        _grantRole(AWARDER_ROLE, initialAwarder);
    }

    /**
     * @notice Award points for a uniquely identified, verified contribution.
     * @dev Role assignment is governed by the Timelock. Reputation has no
     *      ERC-20 transfer or approval interface and cannot alter GOV votes.
     */
    function award(
        address recipient,
        bytes32 contributionId,
        Category category,
        uint256 points
    ) external onlyRole(AWARDER_ROLE) {
        if (
            recipient == address(0) || contributionId == bytes32(0) || points == 0
                || uint8(category) > uint8(Category.ReviewParticipation)
        ) {
            revert InvalidAward();
        }
        if (contributionRecorded[contributionId]) {
            revert ContributionAlreadyRecorded(contributionId);
        }

        contributionRecorded[contributionId] = true;
        awards[contributionId] = Award({
            recipient: recipient,
            points: points,
            category: category,
            active: true
        });
        reputationOf[recipient] += points;
        totalReputation += points;

        emit ReputationAwarded(recipient, contributionId, category, points, msg.sender);
    }

    /// @notice Revoke an active award through a Timelock-governed call.
    function revoke(bytes32 contributionId, string calldata reason)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        Award storage awardRecord = awards[contributionId];
        if (!awardRecord.active) revert AwardNotActive(contributionId);

        awardRecord.active = false;
        reputationOf[awardRecord.recipient] -= awardRecord.points;
        totalReputation -= awardRecord.points;

        emit ReputationRevoked(
            awardRecord.recipient,
            contributionId,
            awardRecord.points,
            reason,
            msg.sender
        );
    }
}
