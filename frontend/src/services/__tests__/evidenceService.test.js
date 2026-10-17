import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { describe, it } from 'node:test';
import { webcrypto } from 'node:crypto';
import {
  MAX_EVIDENCE_FILE_BYTES,
  createEvidenceReference,
  parseEvidenceReference,
  sha256File,
  submitMilestoneEvidence,
  uploadEvidenceFile,
  validateEvidenceFile,
  verifyEvidenceReference,
} from '../evidenceService.js';

const TEST_CID = `b${'a'.repeat(50)}`;
const HELLO_SHA256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

function fileWith(bytes, type = 'text/plain', name = 'report.txt') {
  return new File([bytes], name, { type });
}

describe('evidenceService', () => {
  it('validates allowed file type and rejects empty, oversized, or unsupported files', () => {
    assert.doesNotThrow(() => validateEvidenceFile(fileWith('ok')));
    assert.throws(() => validateEvidenceFile(fileWith('', 'text/plain')), /empty/);
    assert.throws(() => validateEvidenceFile(fileWith('x', 'text/html')), /Allowed file types/);
    assert.throws(() => validateEvidenceFile({
      size: MAX_EVIDENCE_FILE_BYTES + 1,
      type: 'application/pdf',
    }), /10 MiB/);
  });

  it('computes SHA-256 and constructs a parseable on-chain evidence reference', async () => {
    assert.equal(await sha256File(fileWith('hello'), webcrypto), HELLO_SHA256);
    const reference = createEvidenceReference(TEST_CID, HELLO_SHA256.toUpperCase());
    assert.equal(reference, `ipfs://${TEST_CID}#sha256=${HELLO_SHA256}`);
    assert.deepEqual(parseEvidenceReference(reference), { cid: TEST_CID, sha256: HELLO_SHA256 });
    assert.equal(parseEvidenceReference('https://example.test/report.pdf'), null);
  });

  it('passes the selected plan and milestone unchanged into the escrow call', async () => {
    let callArgs;
    const receipt = { hash: '0xconfirmed' };
    const escrowContract = {
      submitEvidence: (...args) => {
        callArgs = args;
        return Promise.resolve(receipt);
      },
    };
    const planId = `0x${'12'.repeat(32)}`;
    assert.equal(await submitMilestoneEvidence(
      escrowContract,
      planId,
      3,
      `ipfs://${TEST_CID}#sha256=${HELLO_SHA256}`
    ), receipt);
    assert.deepEqual(callArgs, [planId, 3, `ipfs://${TEST_CID}#sha256=${HELLO_SHA256}`]);
    assert.throws(() => submitMilestoneEvidence(null, planId, 3, 'ref'), /unavailable/);
  });

  it('uploads only after validation, reports stages, and rejects provider responses without a CID', async () => {
    const fetchCalls = [];
    const fetchImpl = async (...args) => {
      fetchCalls.push(args);
      return { ok: true, text: async () => JSON.stringify({ Name: 'evidence', Hash: TEST_CID }) };
    };
    const progress = [];
    const uploaded = await uploadEvidenceFile(fileWith('hello'), {
      apiUrl: 'http://127.0.0.1:5001/api/v0',
      fetchImpl,
      cryptoImpl: webcrypto,
      onProgress: (value) => progress.push(value),
    });
    assert.deepEqual(uploaded, {
      cid: TEST_CID,
      sha256: HELLO_SHA256,
      reference: `ipfs://${TEST_CID}#sha256=${HELLO_SHA256}`,
    });
    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0][0], /\/add\?pin=true&cid-version=1/);
    assert.deepEqual(progress.map((value) => value.stage), ['hashing', 'uploading', 'uploaded']);

    await assert.rejects(uploadEvidenceFile(fileWith('hello'), {
      apiUrl: 'http://127.0.0.1:5001/api/v0',
      fetchImpl: async () => ({ ok: true, text: async () => '{"Name":"missing"}' }),
      cryptoImpl: webcrypto,
    }), /valid CID/);
  });

  it('returns explicit errors for missing configuration, upload rejection, and network failure', async () => {
    await assert.rejects(
      uploadEvidenceFile(fileWith('hello'), { apiUrl: '', cryptoImpl: webcrypto }),
      /not configured/
    );
    await assert.rejects(uploadEvidenceFile(fileWith('hello'), {
      apiUrl: 'http://127.0.0.1:5001/api/v0',
      fetchImpl: async () => ({ ok: false, status: 500 }),
      cryptoImpl: webcrypto,
    }), /HTTP status 500/);
    await assert.rejects(uploadEvidenceFile(fileWith('hello'), {
      apiUrl: 'http://127.0.0.1:5001/api/v0',
      fetchImpl: async () => { throw new Error('connection refused'); },
      cryptoImpl: webcrypto,
    }), /could not reach/i);
  });

  it('verifies matching bytes and reports mismatch, gateway failure, and malformed metadata distinctly', async () => {
    const matchingFetch = async () => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('hello').buffer,
    });
    const reference = `ipfs://${TEST_CID}#sha256=${HELLO_SHA256}`;
    assert.deepEqual(await verifyEvidenceReference(reference, {
      fetchImpl: matchingFetch,
      gatewayUrl: 'http://127.0.0.1:8080',
      cryptoImpl: webcrypto,
    }), {
      status: 'verified',
      expectedSha256: HELLO_SHA256,
      actualSha256: HELLO_SHA256,
      cid: TEST_CID,
      message: 'The retrieved file matches the recorded SHA-256 digest.',
    });

    const mismatch = await verifyEvidenceReference(reference, {
      fetchImpl: async () => ({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode('different').buffer,
      }),
      gatewayUrl: 'http://127.0.0.1:8080',
      cryptoImpl: webcrypto,
    });
    assert.equal(mismatch.status, 'mismatch');

    assert.equal((await verifyEvidenceReference(reference, {
      fetchImpl: async () => { throw new Error('offline'); },
      gatewayUrl: 'http://127.0.0.1:8080',
      cryptoImpl: webcrypto,
    })).status, 'unavailable');

    assert.equal((await verifyEvidenceReference('ipfs://broken', {
      fetchImpl: async () => { throw new Error('should not fetch'); },
      gatewayUrl: 'http://127.0.0.1:8080',
      cryptoImpl: webcrypto,
    })).status, 'failed');
  });

  it('does not represent missing gateway configuration as verified', async () => {
    const result = await verifyEvidenceReference(`ipfs://${TEST_CID}#sha256=${HELLO_SHA256}`, {
      fetchImpl: async () => { throw new Error('should not fetch'); },
      gatewayUrl: '',
      cryptoImpl: webcrypto,
    });
    assert.equal(result.status, 'failed');
  });

  it('rejects retrieved files above the verification size limit and reports HTTP unavailability', async () => {
    const reference = `ipfs://${TEST_CID}#sha256=${HELLO_SHA256}`;
    const tooLarge = await verifyEvidenceReference(reference, {
      fetchImpl: async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(MAX_EVIDENCE_FILE_BYTES + 1),
      }),
      gatewayUrl: 'http://127.0.0.1:8080',
      cryptoImpl: webcrypto,
    });
    assert.equal(tooLarge.status, 'failed');
    assert.match(tooLarge.message, /10 MiB/);

    assert.equal((await verifyEvidenceReference(reference, {
      fetchImpl: async () => ({ ok: false, status: 404 }),
      gatewayUrl: 'http://127.0.0.1:8080',
      cryptoImpl: webcrypto,
    })).status, 'unavailable');
  });
});
