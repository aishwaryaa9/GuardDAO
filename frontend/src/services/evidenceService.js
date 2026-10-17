export const MAX_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_EVIDENCE_TYPES = new Set([
  'application/pdf',
  'application/json',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
]);

const CID_V0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CID_V1_BASE32 = /^b[a-z2-7]{20,}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/i;

export function validateEvidenceFile(file) {
  if (!file || typeof file.size !== 'number' || typeof file.type !== 'string') {
    throw new Error('Select a valid evidence file.');
  }
  if (file.size === 0) throw new Error('The selected file is empty.');
  if (file.size > MAX_EVIDENCE_FILE_BYTES) {
    throw new Error('Evidence files must be 10 MiB or smaller.');
  }
  if (!ALLOWED_EVIDENCE_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Allowed file types are PDF, JSON, plain text, CSV, JPEG, and PNG.');
  }
}

export async function sha256File(file, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle?.digest) {
    throw new Error('This browser does not support secure SHA-256 file hashing.');
  }
  const digest = await cryptoImpl.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createEvidenceReference(cid, sha256) {
  if (typeof cid !== 'string' || !(CID_V0.test(cid) || CID_V1_BASE32.test(cid))) {
    throw new Error('The IPFS provider returned an invalid CID.');
  }
  if (typeof sha256 !== 'string' || !SHA256_HEX.test(sha256)) {
    throw new Error('A valid SHA-256 digest is required.');
  }
  return `ipfs://${cid}#sha256=${sha256.toLowerCase()}`;
}

export function submitMilestoneEvidence(escrowContract, planId, milestoneIndex, reference) {
  if (!escrowContract || typeof escrowContract.submitEvidence !== 'function') {
    throw new Error('Milestone escrow is unavailable for evidence submission.');
  }
  return escrowContract.submitEvidence(planId, milestoneIndex, reference);
}

export function parseEvidenceReference(reference) {
  if (typeof reference !== 'string') return null;
  const match = /^ipfs:\/\/([^/#?]+)#sha256=([a-f0-9]{64})$/i.exec(reference.trim());
  if (!match || !(CID_V0.test(match[1]) || CID_V1_BASE32.test(match[1]))) return null;
  return { cid: match[1], sha256: match[2].toLowerCase() };
}

function getIpfsEnvironment() {
  return import.meta.env || {};
}

export function getIpfsConfiguration() {
  const env = getIpfsEnvironment();
  return {
    apiUrl: (env.VITE_IPFS_API_URL || '').trim().replace(/\/+$/, ''),
    gatewayUrl: (env.VITE_IPFS_GATEWAY_URL || '').trim().replace(/\/+$/, ''),
  };
}

function getCidFromResponse(body) {
  const lines = body.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    let result;
    try {
      result = JSON.parse(lines[index]);
    } catch {
      continue;
    }
    const cid = result.Hash || result.Cid?.['/'] || result.cid;
    if (typeof cid === 'string' && (CID_V0.test(cid) || CID_V1_BASE32.test(cid))) return cid;
  }
  throw new Error('The IPFS service response did not include a valid CID.');
}

export async function uploadEvidenceFile(file, {
  fetchImpl = globalThis.fetch,
  cryptoImpl = globalThis.crypto,
  apiUrl = getIpfsConfiguration().apiUrl,
  onProgress = () => {},
} = {}) {
  validateEvidenceFile(file);
  if (!apiUrl) throw new Error('IPFS upload is not configured. Set VITE_IPFS_API_URL first.');
  if (typeof fetchImpl !== 'function') throw new Error('This browser cannot connect to the IPFS service.');

  onProgress({ stage: 'hashing' });
  const sha256 = await sha256File(file, cryptoImpl);
  onProgress({ stage: 'uploading' });

  const formData = new FormData();
  formData.append('file', file, 'evidence');
  let response;
  try {
    response = await fetchImpl(`${apiUrl}/add?pin=true&cid-version=1`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    throw new Error('Could not reach the configured IPFS upload service.');
  }
  if (!response.ok) {
    throw new Error(`IPFS upload failed with HTTP status ${response.status}.`);
  }

  const cid = getCidFromResponse(await response.text());
  const reference = createEvidenceReference(cid, sha256);
  onProgress({ stage: 'uploaded', cid, sha256 });
  return { cid, sha256, reference };
}

function getGatewayUrl(gatewayUrl, cid) {
  if (!gatewayUrl) {
    throw new Error('IPFS retrieval is not configured. Set VITE_IPFS_GATEWAY_URL first.');
  }
  return `${gatewayUrl}/ipfs/${encodeURIComponent(cid)}`;
}

async function readEvidenceBytes(response) {
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_EVIDENCE_FILE_BYTES) {
    throw new Error('Retrieved evidence exceeds the 10 MiB verification limit.');
  }
  if (!response.body?.getReader) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_EVIDENCE_FILE_BYTES) {
      throw new Error('Retrieved evidence exceeds the 10 MiB verification limit.');
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_EVIDENCE_FILE_BYTES) {
      await reader.cancel();
      throw new Error('Retrieved evidence exceeds the 10 MiB verification limit.');
    }
    chunks.push(value);
  }
  const result = new Uint8Array(totalBytes);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return result.buffer;
}

export async function verifyEvidenceReference(reference, {
  fetchImpl = globalThis.fetch,
  cryptoImpl = globalThis.crypto,
  gatewayUrl = getIpfsConfiguration().gatewayUrl,
} = {}) {
  const parsed = parseEvidenceReference(reference);
  if (!parsed) {
    return {
      status: 'failed',
      message: 'This reference does not contain a supported IPFS CID and SHA-256 digest.',
    };
  }

  let url;
  try {
    url = getGatewayUrl(gatewayUrl, parsed.cid);
  } catch (error) {
    return { status: 'failed', message: error.message };
  }

  let response;
  try {
    response = await fetchImpl(url);
  } catch {
    return { status: 'unavailable', message: 'The configured IPFS gateway could not be reached.' };
  }
  if (!response.ok) {
    return {
      status: 'unavailable',
      message: `The evidence could not be retrieved (HTTP ${response.status}).`,
    };
  }

  try {
    const bytes = await readEvidenceBytes(response);
    const actualSha256 = await sha256File({ arrayBuffer: async () => bytes }, cryptoImpl);
    const verified = actualSha256 === parsed.sha256;
    return {
      status: verified ? 'verified' : 'mismatch',
      expectedSha256: parsed.sha256,
      actualSha256,
      cid: parsed.cid,
      message: verified
        ? 'The retrieved file matches the recorded SHA-256 digest.'
        : 'The retrieved file does not match the recorded SHA-256 digest.',
    };
  } catch (error) {
    return {
      status: 'failed',
      message: error.message || 'The retrieved evidence could not be hashed.',
    };
  }
}

export async function copyText(value) {
  if (!globalThis.navigator?.clipboard?.writeText) {
    throw new Error('Clipboard access is unavailable in this browser.');
  }
  await globalThis.navigator.clipboard.writeText(value);
}
