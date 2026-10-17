import { formatEther as ethersFormatEther, parseEther as ethersParseEther } from 'ethers';

/**
 * Shorten an Ethereum address to 0x1234...abcd
 */
export function shortenAddress(address, chars = 4) {
  if (!address) return '';
  if (address.length < chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Safely format wei bigint into formatted human-readable ETH string
 */
export function formatEther(wei, precision = 4) {
  if (wei === null || wei === undefined) return '0.0';
  try {
    const val = typeof wei === 'bigint' ? wei : BigInt(wei.toString());
    const formatted = ethersFormatEther(val);
    const parts = formatted.split('.');
    if (parts.length === 1) return parts[0];
    return `${parts[0]}.${parts[1].slice(0, precision)}`;
  } catch (err) {
    console.error('Error formatting ether:', err);
    return '0.0';
  }
}

/**
 * Format a token amount with 18 decimals
 */
export function formatTokens(amount, precision = 2) {
  if (amount === null || amount === undefined) return '0';
  try {
    const val = typeof amount === 'bigint' ? amount : BigInt(amount.toString());
    const formatted = ethersFormatEther(val);
    const num = parseFloat(formatted);
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: precision,
      minimumFractionDigits: 0,
    }).format(num);
  } catch (err) {
    console.error('Error formatting tokens:', err);
    return '0';
  }
}

/**
 * Safely parse user input string to wei BigInt
 */
export function parseEtherSafely(valueStr) {
  if (!valueStr || isNaN(Number(valueStr))) return 0n;
  try {
    return ethersParseEther(valueStr.toString().trim());
  } catch {
    return 0n;
  }
}

/**
 * Calculate percentage with safe BigInt or number
 */
export function calculatePercentage(current, total) {
  try {
    if (!total || total === 0n || total === 0) return 0;
    const c = typeof current === 'bigint' ? Number(current) : Number(current);
    const t = typeof total === 'bigint' ? Number(total) : Number(total);
    if (t === 0) return 0;
    const pct = (c / t) * 100;
    return Math.min(Math.max(pct, 0), 100);
  } catch {
    return 0;
  }
}

/**
 * Format Unix timestamp to localized string
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  try {
    const ts = typeof timestamp === 'bigint' ? Number(timestamp) : Number(timestamp);
    if (ts === 0) return 'Immediate';
    return new Date(ts * 1000).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'N/A';
  }
}

/**
 * Format block difference into approximate time
 */
export function formatBlocksToTime(blocks, avgBlockSec = 12) {
  if (!blocks || blocks <= 0) return '0s';
  const totalSeconds = Number(blocks) * avgBlockSec;
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `~${days}d ${hours}h`;
  if (hours > 0) return `~${hours}h ${minutes}m`;
  if (minutes > 0) return `~${minutes}m`;
  return `~${totalSeconds}s`;
}
