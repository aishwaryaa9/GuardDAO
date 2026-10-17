import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ethers } from 'ethers';
import { CONTRACT_ABIS, DEFAULT_CONTRACT_ADDRESSES } from '../../config/contracts.js';
import {
  createAuditCsv,
  filterAuditRecords,
  getTransactionDetails,
  paginateRecords,
  scanAuditEvents,
  verifyAuditNetwork,
  WrongAuditNetworkError,
} from '../auditExplorer.js';

const governor = new ethers.Interface(CONTRACT_ABIS.DAOGovernor);
const escrow = new ethers.Interface(CONTRACT_ABIS.MilestoneEscrow);
const planId = `0x${'11'.repeat(32)}`;
const recipient = '0x00000000000000000000000000000000000000aa';

function eventLog(iface, eventName, args, address, blockNumber, txHash, index = 0) {
  const fragment = iface.getEvent(eventName);
  const encoded = iface.encodeEventLog(fragment, args);
  return {
    address,
    topics: encoded.topics,
    data: encoded.data,
    blockNumber,
    blockHash: `0x${'ab'.repeat(32)}`,
    transactionHash: txHash,
    transactionIndex: 0,
    index,
    logIndex: index,
  };
}

function mockProvider(logs = [], overrides = {}) {
  const requested = [];
  return {
    requested,
    send: async () => '0x7a69',
    getBlockNumber: async () => 10,
    getLogs: async (filter) => {
      requested.push(filter);
      return logs.filter((log) => log.address.toLowerCase() === filter.address.toLowerCase()
        && log.blockNumber >= filter.fromBlock
        && log.blockNumber <= filter.toBlock);
    },
    getBlock: async (number) => ({ number, timestamp: 1_700_000_000 + number, hash: `0x${'ab'.repeat(32)}` }),
    ...overrides,
  };
}

describe('auditExplorer', () => {
  it('validates the actual RPC chain ID and rejects another network', async () => {
    const provider = mockProvider([], { send: async () => '0xaa36a7' });
    await assert.rejects(verifyAuditNetwork(provider), WrongAuditNetworkError);
  });

  it('decodes contract events, deduplicates logs, and relates same-transaction governance execution', async () => {
    const txHash = `0x${'22'.repeat(32)}`;
    const logs = [
      eventLog(governor, 'ProposalExecuted', [123n], DEFAULT_CONTRACT_ADDRESSES.DAOGovernor, 4, txHash, 0),
      eventLog(escrow, 'MilestoneReleased', [planId, 0n, recipient, ethers.parseEther('1')], DEFAULT_CONTRACT_ADDRESSES.MilestoneEscrow, 4, txHash, 1),
    ];
    const provider = mockProvider([...logs, logs[1]]);
    const result = await scanAuditEvents({
      provider,
      fromBlock: 1,
      toBlock: 5,
      maxBlockRange: 10,
    });
    assert.equal(result.records.length, 2);
    const release = result.records.find((record) => record.eventType === 'MilestoneReleased');
    assert.deepEqual(release.args, {
      planId,
      milestoneIndex: '0',
      recipient: ethers.getAddress(recipient),
      amount: ethers.parseEther('1').toString(),
    });
    assert.deepEqual(release.relatedProposalIds, ['123']);
    assert.equal(release.timestamp, 1_700_000_004);
    assert.equal(result.coverage.complete, true);
  });

  it('queries bounded block chunks and rejects ranges above the configured maximum', async () => {
    const provider = mockProvider();
    await scanAuditEvents({ provider, fromBlock: 1, toBlock: 5, maxBlockRange: 5, chunkSize: 2 });
    assert.equal(provider.requested.length, 18);
    assert.deepEqual(provider.requested.map(({ fromBlock, toBlock }) => [fromBlock, toBlock]).slice(0, 3), [
      [1, 2],
      [1, 2],
      [1, 2],
    ]);
    assert.equal(provider.requested.every(({ toBlock, fromBlock }) => toBlock - fromBlock < 2), true);
    await assert.rejects(scanAuditEvents({
      provider,
      fromBlock: 1,
      toBlock: 6,
      maxBlockRange: 5,
    }), /5 blocks/);
  });

  it('returns explicit partial coverage after an RPC event-query failure', async () => {
    const provider = mockProvider([], {
      getLogs: async ({ address }) => {
        if (address.toLowerCase() === DEFAULT_CONTRACT_ADDRESSES.Treasury.toLowerCase()) {
          throw new Error('provider log limit');
        }
        return [];
      },
    });
    const result = await scanAuditEvents({
      provider,
      fromBlock: 0,
      toBlock: 2,
      maxBlockRange: 10,
    });
    assert.deepEqual(result.records, []);
    assert.equal(result.coverage.complete, false);
    assert.deepEqual(
      (({ contract, fromBlock, toBlock }) => ({ contract, fromBlock, toBlock }))(result.coverage.failures[0]),
      { contract: 'Treasury', fromBlock: 0, toBlock: 2 }
    );
  });

  it('returns honest empty history and preserves unknown CSV amounts as empty values', async () => {
    const result = await scanAuditEvents({
      provider: mockProvider(),
      fromBlock: 0,
      toBlock: 0,
      maxBlockRange: 1,
    });
    assert.deepEqual(result.records, []);
    assert.equal(result.coverage.complete, true);
    const csv = createAuditCsv([{
      blockNumber: 0,
      timestamp: null,
      eventType: 'RoleGranted',
      contractName: 'DAOTimelock',
      contractAddress: recipient,
      txHash: '0xunknown',
      logIndex: 0,
      args: {},
    }], 31337, new Date('2026-01-01T00:00:00.000Z'));
    assert.equal(csv.split('\r\n')[1].split(',')[12], '""');
  });

  it('filters events by type, hash, identifier, and block range and paginates safely', () => {
    const records = [
      {
        txHash: '0xabcdef',
        eventType: 'MilestoneReleased',
        blockNumber: 5,
        relatedPlanId: planId,
        args: { planId },
      },
      {
        txHash: '0x123456',
        eventType: 'ProposalExecuted',
        blockNumber: 8,
        relatedProposalIds: ['77'],
        args: { proposalId: '77' },
      },
    ];
    assert.equal(filterAuditRecords(records, {
      eventType: 'MilestoneReleased',
      search: 'ABC',
      identifier: planId.slice(0, 10),
      fromBlock: 4,
      toBlock: 6,
    }).length, 1);
    assert.equal(filterAuditRecords(records, { identifier: '77' }).length, 1);
    assert.deepEqual(paginateRecords(records, 2, 1), {
      page: 2,
      pageCount: 2,
      pageRecords: [records[1]],
    });
    assert.deepEqual(paginateRecords([], 4, 10), {
      page: 1,
      pageCount: 1,
      pageRecords: [],
    });
  });

  it('quotes CSV content and neutralizes spreadsheet formulas', () => {
    const csv = createAuditCsv([{
      blockNumber: 7,
      timestamp: null,
      eventType: 'MilestoneRejected',
      contractName: 'MilestoneEscrow',
      contractAddress: recipient,
      txHash: '0xabc',
      logIndex: 2,
      args: { sender: '=HYPERLINK("bad","click")', reason: 'rejected, "reason"\nnext' },
    }], 31337, new Date('2026-01-01T00:00:00.000Z'));
    assert.ok(csv.includes('"exported_at","chain_id","block_number"'));
    assert.ok(csv.includes('"\'=HYPERLINK(""bad"",""click"")"'));
    assert.ok(csv.includes('"rejected, \\""reason\\""\\nnext"'));
    assert.ok(csv.includes('"0xabc"'));
  });

  it('distinguishes a failed receipt from an unavailable receipt', async () => {
    const record = { txHash: '0xabc', blockNumber: 3, blockHash: '0xdef', timestamp: 123 };
    const failed = await getTransactionDetails({
      getTransactionReceipt: async () => ({
        status: 0,
        from: recipient,
        to: null,
        hash: '0xabc',
        gasUsed: 55n,
        confirmations: async () => 1,
      }),
      getBlock: async () => ({ number: 3, timestamp: 123, hash: '0xdef' }),
    }, record);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.gasUsed, '55');
    const unavailable = await getTransactionDetails({
      getTransactionReceipt: async () => null,
      getBlock: async () => null,
    }, record);
    assert.equal(unavailable.status, 'receipt-unavailable');
    assert.equal(unavailable.from, null);
  });
});
