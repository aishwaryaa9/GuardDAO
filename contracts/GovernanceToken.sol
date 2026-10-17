// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title GovernanceToken
 * @author Amalendu Suresh
 * @notice ERC-20 token with vote-delegation and EIP-2612 permit support.
 * @dev Used as the voting weight for the DAO Governor contract.
 *      Holders must self-delegate (or delegate to another address) before
 *      their tokens count as voting power.
 */
contract GovernanceToken is ERC20, ERC20Permit, ERC20Votes {
    /// @notice Initial supply minted to the deployer at construction.
    uint256 public constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;

    /**
     * @param initialHolder Address that receives the entire initial supply.
     */
    constructor(address initialHolder)
        ERC20("Governance Token", "GOV")
        ERC20Permit("Governance Token")
    {
        require(initialHolder != address(0), "GovernanceToken: zero address");
        _mint(initialHolder, INITIAL_SUPPLY);
    }

    // ---------------------------------------------------------------------
    // Required Solidity overrides for multiple inheritance (OZ v5)
    // ---------------------------------------------------------------------

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
