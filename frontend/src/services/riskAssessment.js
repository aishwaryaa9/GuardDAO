import { ethers } from 'ethers';
import {
  CONTRACT_ABIS,
  getContractAddresses,
} from '../config/contracts';
import {
  getGovernorContract,
  getTreasuryContract,
} from './contracts';
import { getJsonRpcProvider } from './provider';

const SPEND_FAILURES = [
  'No policy failure',
  'Spending policy is disabled for this asset',
  'Amount must be greater than zero',
  'Recipient is not approved by governance',
  'Amount exceeds the per-transaction limit',
  'Amount exceeds the active spending-window limit',
];

export async function assessProposalRisk(proposal) {
  const addresses = getContractAddresses();
  const provider = getJsonRpcProvider();
  const governor = getGovernorContract(provider);
  const treasury = getTreasuryContract(provider);
  const treasuryInterface = new ethers.Interface(CONTRACT_ABIS.Treasury);

  return Promise.all((proposal.targets || []).map(async (target, index) => {
    const calldata = proposal.calldatas?.[index] || '0x';
    const value = BigInt(proposal.values?.[index] ?? 0n);
    const selector = calldata.length >= 10 ? calldata.slice(0, 10) : '0x00000000';
    const callAllowed = await governor.allowedCalls(target, selector);
    const checks = [
      { label: 'Target and function selector are allowlisted', passed: callAllowed },
      { label: 'Proposal does not attach unexpected ETH value', passed: value === 0n },
    ];

    let operation = 'Unknown contract operation';
    let amount = null;
    let recipient = null;
    let destinationApproved = null;
    let policyResult = null;
    let warnings = [];

    if (target.toLowerCase() === addresses.Treasury.toLowerCase()) {
      let decoded;
      try {
        decoded = treasuryInterface.parseTransaction({ data: calldata, value });
      } catch {
        decoded = null;
      }

      if (!decoded) {
        checks.push({
          label: 'Treasury calldata decodes against the current ABI',
          passed: false,
        });
        warnings.push('Treasury calldata could not be decoded against the current ABI.');
      } else {
        checks.push({
          label: 'Treasury calldata decodes against the current ABI',
          passed: true,
        });
        if (decoded?.name === 'disburseEth') {
          operation = 'Treasury ETH disbursement';
          recipient = decoded.args[0];
          amount = `${ethers.formatEther(decoded.args[1])} ETH`;
          policyResult = Number(await treasury.checkSpend(
            ethers.ZeroAddress,
            recipient,
            decoded.args[1]
          ));
        } else if (decoded?.name === 'disburseToken') {
          operation = 'Treasury ERC-20 disbursement';
          const [tokenAddress, to, tokenAmount] = decoded.args;
          recipient = to;
          try {
            const token = new ethers.Contract(tokenAddress, [
              'function decimals() view returns (uint8)',
              'function symbol() view returns (string)',
            ], provider);
            const [decimals, symbol] = await Promise.all([token.decimals(), token.symbol()]);
            amount = `${ethers.formatUnits(tokenAmount, decimals)} ${symbol}`;
          } catch {
            amount = `${tokenAmount.toString()} base units of ${tokenAddress}`;
            warnings.push('Token decimals or symbol could not be read; amount is shown in base units.');
          }
          policyResult = Number(await treasury.checkSpend(tokenAddress, recipient, tokenAmount));
        } else {
          operation = `Treasury policy operation (${decoded?.name || 'unparsed'})`;
          warnings.push('Policy changes affect future transfers and require careful review.');
        }
      }

      if (recipient) {
        destinationApproved = await treasury.approvedRecipients(recipient);
        checks.push({
          label: `Recipient ${recipient} is approved`,
          passed: destinationApproved,
        });
      }
      if (policyResult !== null) {
        checks.push({
          label: SPEND_FAILURES[policyResult] || `Unknown treasury policy result (${policyResult})`,
          passed: policyResult === 0,
        });
      }
    } else if (target.toLowerCase() === addresses.MilestoneEscrow?.toLowerCase()) {
      operation = 'Milestone escrow operation';
      warnings.push('Milestone evidence references are off-chain claims, not proof of completed work.');
    } else if (target.toLowerCase() === addresses.DAOReputation?.toLowerCase()) {
      operation = 'Governance reputation administration';
      warnings.push('Role grants and reputation revocations require scrutiny; points do not prove identity.');
    } else {
      operation = 'Non-standard or unrecognized contract call';
      warnings.push('The UI cannot establish that an unrecognized call is safe.');
    }

    return {
      index,
      target,
      selector,
      operation,
      amount,
      recipient,
      destinationApproved,
      checks,
      warnings,
      permittedByCurrentGuardrails:
        checks.every((check) => check.passed) && callAllowed && value === 0n,
    };
  }));
}
