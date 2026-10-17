// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governor} from "@openzeppelin/contracts/governance/Governor.sol";
import {GovernorSettings} from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import {GovernorCountingSimple} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {GovernorVotes} from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {GovernorVotesQuorumFraction} from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import {GovernorTimelockControl} from "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title DAOGovernor
 * @author Amalendu Suresh
 * @notice On-chain DAO governor with simple For/Against/Abstain voting,
 *         quorum as a fraction of token supply, and timelock-controlled execution.
 *
 * @dev Configuration:
 *   - voting delay:     1 block  (proposal active immediately for the test/demo)
 *   - voting period:    ~1 week  (50_400 blocks @ 12s blocks)
 *   - proposal threshold: 1 GOV  (minimum to propose)
 *   - quorum:           4%       (of total supply, must vote For/Abstain to count)
 *
 *   Update these constants for production use cases.
 */
contract DAOGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    mapping(address target => mapping(bytes4 selector => bool allowed)) public allowedCalls;

    error InvalidAllowedCallConfiguration();
    error InvalidProposalBatch();
    error DisallowedProposalCall(address target, bytes4 selector);

    event AllowedCallUpdated(address indexed target, bytes4 indexed selector, bool allowed);

    /**
     * @param _token      Governance token contract (must be ERC20Votes-compatible).
     * @param _timelock   Timelock that will queue and execute approved proposals.
     * @param initialTargets Targets permitted in proposal actions at deployment.
     * @param initialSelectors Function selectors permitted for each target.
     */
    constructor(
        IVotes _token,
        TimelockController _timelock,
        address[] memory initialTargets,
        bytes4[][] memory initialSelectors
    )
        Governor("DAOGovernor")
        GovernorSettings(
            1,        /* votingDelay:    1 block */
            50_400,   /* votingPeriod:   ~1 week at 12s blocks */
            1e18      /* proposalThreshold: 1 GOV token */
        )
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(4) /* quorum: 4% of total supply */
        GovernorTimelockControl(_timelock)
    {
        if (initialTargets.length != initialSelectors.length) {
            revert InvalidAllowedCallConfiguration();
        }

        for (uint256 i; i < initialTargets.length; ++i) {
            if (initialTargets[i] == address(0) || initialSelectors[i].length == 0) {
                revert InvalidAllowedCallConfiguration();
            }
            for (uint256 j; j < initialSelectors[i].length; ++j) {
                allowedCalls[initialTargets[i]][initialSelectors[i][j]] = true;
                emit AllowedCallUpdated(initialTargets[i], initialSelectors[i][j], true);
            }
        }

        bytes4 policySelector = bytes4(keccak256("setAllowedCall(address,bytes4,bool)"));
        allowedCalls[address(this)][policySelector] = true;
        emit AllowedCallUpdated(address(this), policySelector, true);
    }

    /**
     * @notice Change the target/selector allowlist through a timelock-executed
     *         governance operation. New calls must be approved in a separate
     *         proposal before they can be submitted.
     */
    function setAllowedCall(address target, bytes4 selector, bool allowed)
        external
        onlyGovernance
    {
        if (target == address(0) || selector == bytes4(0)) {
            revert InvalidAllowedCallConfiguration();
        }
        allowedCalls[target][selector] = allowed;
        emit AllowedCallUpdated(target, selector, allowed);
    }

    function isAllowedCall(address target, bytes4 selector) external view returns (bool) {
        return allowedCalls[target][selector];
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public override returns (uint256) {
        _validateOperations(targets, values, calldatas);
        return super.propose(targets, values, calldatas, description);
    }

    // ---------------------------------------------------------------------
    // Required overrides for multiple inheritance (OZ v5)
    // ---------------------------------------------------------------------

    function votingDelay()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(Governor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }

    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        _validateOperations(targets, values, calldatas);
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _validateOperations(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas
    ) private view {
        if (targets.length == 0 || targets.length != values.length || targets.length != calldatas.length) {
            revert InvalidProposalBatch();
        }

        for (uint256 i; i < targets.length; ++i) {
            bytes4 selector;
            if (calldatas[i].length >= 4) {
                bytes memory data = calldatas[i];
                assembly ("memory-safe") {
                    selector := mload(add(data, 32))
                }
            }
            if (
                targets[i] == address(0) || values[i] != 0
                    || !allowedCalls[targets[i]][selector]
            ) {
                revert DisallowedProposalCall(targets[i], selector);
            }
        }
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }
}
