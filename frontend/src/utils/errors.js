/**
 * Parse Ethereum transaction or provider error into friendly user message
 */
export function parseContractError(error) {
  if (!error) return 'An unexpected error occurred.';

  // MetaMask / EIP-1193 User rejected request
  if (
    error.code === 4001 ||
    error.code === 'ACTION_REJECTED' ||
    (error.message && error.message.includes('user rejected action')) ||
    (error.message && error.message.includes('User denied transaction signature'))
  ) {
    return 'Transaction rejected by user in wallet.';
  }

  // Network or connection errors
  if (
    error.code === 'NETWORK_ERROR' ||
    (error.message && error.message.includes('could not detect network')) ||
    (error.message && error.message.includes('Failed to fetch'))
  ) {
    return 'Could not connect to the local RPC node (http://127.0.0.1:8545). Please ensure Hardhat node is running.';
  }

  // Insufficient funds
  if (
    error.code === 'INSUFFICIENT_FUNDS' ||
    (error.message && error.message.includes('insufficient funds'))
  ) {
    return 'Insufficient ETH balance in your wallet to pay for transaction gas or transfer value.';
  }

  // Contract revert reason extraction
  if (error.reason) {
    return `Transaction reverted: ${error.reason}`;
  }

  if (error.shortMessage) {
    return error.shortMessage;
  }

  if (error.data && error.data.message) {
    return error.data.message;
  }

  // Check Governor common errors
  const msg = error.message || '';
  if (msg.includes('GovernorUnexpectedProposalState')) {
    return 'The proposal is not in the required state for this action.';
  }
  if (msg.includes('GovernorAlreadyCastVote')) {
    return 'You have already voted on this proposal.';
  }
  if (msg.includes('GovernorDisabledDeposit')) {
    return 'Deposit is disabled for this governor.';
  }
  if (msg.includes('GovernorRestrictedProposer')) {
    return 'Your voting power is below the required proposal threshold (1 GOV).';
  }
  if (msg.includes('TimelockUnexpectedOperationState')) {
    return 'Timelock operation is not in the expected state for queue or execution.';
  }

  // Return cleaned message or fallback
  return msg.length > 120 ? `${msg.slice(0, 117)}...` : msg;
}
