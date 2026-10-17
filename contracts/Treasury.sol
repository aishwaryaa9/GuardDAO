// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Treasury
 * @author Amalendu Suresh
 * @notice DAO-owned treasury holding ETH and ERC-20 funds. Spend functions
 *         are owner-gated — the owner should be the Timelock, so spending
 *         requires a successful Governor proposal.
 */
contract Treasury is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct AssetPolicy {
        uint256 maxPerTransaction;
        uint256 maxPerWindow;
        uint64 windowSeconds;
        uint64 windowStart;
        uint256 windowSpent;
        bool enabled;
    }

    enum SpendFailure {
        None,
        AssetPolicyDisabled,
        ZeroAmount,
        RecipientNotApproved,
        PerTransactionLimitExceeded,
        WindowLimitExceeded
    }

    mapping(address asset => AssetPolicy policy) public assetPolicies;
    mapping(address recipient => bool approved) public approvedRecipients;

    error SpendNotPermitted(SpendFailure reason);
    error InvalidAssetPolicy();
    error InvalidRecipient();

    /// @notice Emitted whenever ETH is sent out of the treasury.
    event EthDisbursed(address indexed to, uint256 amount, string reason);

    /// @notice Emitted whenever an ERC-20 transfer is made.
    event TokenDisbursed(address indexed token, address indexed to, uint256 amount, string reason);
    event AssetPolicyUpdated(
        address indexed asset,
        uint256 maxPerTransaction,
        uint256 maxPerWindow,
        uint64 windowSeconds,
        bool enabled
    );
    event RecipientPolicyUpdated(address indexed recipient, bool approved);

    /**
     * @param initialOwner The owner — set to the Timelock so spends require a passed proposal.
     */
    constructor(address initialOwner) Ownable(initialOwner) {
        assetPolicies[address(0)] = AssetPolicy({
            maxPerTransaction: 1 ether,
            maxPerWindow: 5 ether,
            windowSeconds: 1 days,
            windowStart: uint64(block.timestamp),
            windowSpent: 0,
            enabled: true
        });
        emit AssetPolicyUpdated(address(0), 1 ether, 5 ether, 1 days, true);
    }

    /// @notice Accept ETH deposits into the treasury.
    receive() external payable {}

    /**
     * @notice Send ETH from the treasury. Only callable by owner (= Timelock = DAO).
     * @param to      Recipient address.
     * @param amount  Amount of ETH (wei) to send.
     * @param reason  Human-readable reason — emitted in the event for audit trail.
     */
    function disburseEth(address payable to, uint256 amount, string calldata reason)
        external
        onlyOwner
        nonReentrant
    {
        require(to != address(0), "Treasury: zero recipient");
        require(amount > 0 && amount <= address(this).balance, "Treasury: bad amount");
        _consumeSpend(address(0), to, amount);
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Treasury: eth transfer failed");
        emit EthDisbursed(to, amount, reason);
    }

    /**
     * @notice Send an ERC-20 token from the treasury. Only callable by owner.
     * @param token   ERC-20 contract address.
     * @param to      Recipient address.
     * @param amount  Token amount.
     * @param reason  Human-readable reason for the audit trail.
     */
    function disburseToken(
        address token,
        address to,
        uint256 amount,
        string calldata reason
    ) external onlyOwner nonReentrant {
        require(token != address(0), "Treasury: zero token");
        require(to != address(0), "Treasury: zero recipient");
        require(amount > 0, "Treasury: zero amount");
        _consumeSpend(token, to, amount);
        IERC20(token).safeTransfer(to, amount);
        emit TokenDisbursed(token, to, amount, reason);
    }

    /**
     * @notice Configure spending limits for an asset. ETH is represented by
     *         address(0); ERC-20 amounts use that token's smallest unit.
     */
    function setAssetPolicy(
        address asset,
        uint256 maxPerTransaction,
        uint256 maxPerWindow,
        uint64 windowSeconds,
        bool enabled
    ) external onlyOwner {
        if (
            windowSeconds == 0
                || (enabled && (maxPerTransaction == 0 || maxPerWindow < maxPerTransaction))
        ) {
            revert InvalidAssetPolicy();
        }

        AssetPolicy storage policy = assetPolicies[asset];
        policy.maxPerTransaction = maxPerTransaction;
        policy.maxPerWindow = maxPerWindow;
        policy.windowSeconds = windowSeconds;
        policy.enabled = enabled;
        if (policy.windowStart == 0) {
            policy.windowStart = uint64(block.timestamp);
        }

        emit AssetPolicyUpdated(asset, maxPerTransaction, maxPerWindow, windowSeconds, enabled);
    }

    /// @notice Set an approved payout recipient through the Timelock owner.
    function setRecipientAllowed(address recipient, bool approved) external onlyOwner {
        if (recipient == address(0)) revert InvalidRecipient();
        approvedRecipients[recipient] = approved;
        emit RecipientPolicyUpdated(recipient, approved);
    }

    /// @notice Return the policy failure code without attempting a transfer.
    function checkSpend(address asset, address recipient, uint256 amount)
        external
        view
        returns (SpendFailure)
    {
        return _spendFailure(asset, recipient, amount);
    }

    /// @notice Current ETH balance held by the treasury.
    function ethBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Current balance of a specific ERC-20 token held by the treasury.
    function tokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function _consumeSpend(address asset, address recipient, uint256 amount) private {
        SpendFailure failure = _spendFailure(asset, recipient, amount);
        if (failure != SpendFailure.None) revert SpendNotPermitted(failure);

        AssetPolicy storage policy = assetPolicies[asset];
        if (block.timestamp >= uint256(policy.windowStart) + policy.windowSeconds) {
            policy.windowStart = uint64(block.timestamp);
            policy.windowSpent = 0;
        }
        policy.windowSpent += amount;
    }

    function _spendFailure(address asset, address recipient, uint256 amount)
        private
        view
        returns (SpendFailure)
    {
        AssetPolicy storage policy = assetPolicies[asset];
        if (!policy.enabled) return SpendFailure.AssetPolicyDisabled;
        if (amount == 0) return SpendFailure.ZeroAmount;
        if (!approvedRecipients[recipient]) return SpendFailure.RecipientNotApproved;
        if (amount > policy.maxPerTransaction) return SpendFailure.PerTransactionLimitExceeded;

        uint256 spent = policy.windowSpent;
        if (block.timestamp >= uint256(policy.windowStart) + policy.windowSeconds) {
            spent = 0;
        }
        if (spent > policy.maxPerWindow || amount > policy.maxPerWindow - spent) {
            return SpendFailure.WindowLimitExceeded;
        }
        return SpendFailure.None;
    }
}
