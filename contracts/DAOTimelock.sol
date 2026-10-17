// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title DAOTimelock
 * @author Amalendu Suresh
 * @notice Timelock that delays execution of governance-approved proposals.
 * @dev    The Governor must hold the PROPOSER_ROLE so that successful
 *         proposals can be queued. Anyone with EXECUTOR_ROLE can execute
 *         after the delay elapses (pass address(0) to make execution permissionless).
 */
contract DAOTimelock is TimelockController {
    /**
     * @param minDelay    Minimum delay (seconds) before a queued operation can execute.
     * @param proposers   Addresses allowed to schedule operations (usually the Governor).
     * @param executors   Addresses allowed to execute operations (use address(0) for open).
     * @param admin       Optional admin (set to address(0) to renounce admin rights).
     */
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}
