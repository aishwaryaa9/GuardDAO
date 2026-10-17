import React, { useState } from 'react';
import { Check, Copy, FileCheck2, ShieldAlert, Upload, X } from 'lucide-react';
import { Button } from '../common/Button';
import { Textarea } from '../common/Input';
import {
  ALLOWED_EVIDENCE_TYPES,
  copyText,
  getIpfsConfiguration,
  parseEvidenceReference,
  uploadEvidenceFile,
  validateEvidenceFile,
  verifyEvidenceReference,
} from '../../services/evidenceService';

const VERIFICATION_STYLES = {
  verified: 'text-emerald-300',
  mismatch: 'text-rose-300',
  unavailable: 'text-amber-300',
  failed: 'text-rose-300',
};

export function EvidenceManager({
  planId,
  milestoneIndex,
  evidenceReference = '',
  isSubmitted = false,
  isRecipient = false,
  isCorrectNetwork = false,
  isConnected = false,
  isSubmitting = false,
  onSubmitEvidence,
}) {
  const ipfsConfiguration = getIpfsConfiguration();
  const [file, setFile] = useState(null);
  const [uploaded, setUploaded] = useState(null);
  const [manualReference, setManualReference] = useState('');
  const [uploadStage, setUploadStage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [verification, setVerification] = useState(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [submissionTxHash, setSubmissionTxHash] = useState('');

  const savedReference = evidenceReference || '';
  const parsedSavedReference = parseEvidenceReference(savedReference);

  const chooseFile = (event) => {
    const nextFile = event.target.files?.[0] || null;
    event.target.value = '';
    setUploadError('');
    setVerification(null);
    if (!nextFile) return;
    try {
      validateEvidenceFile(nextFile);
      setFile(nextFile);
      setUploaded(null);
    } catch (error) {
      setFile(null);
      setUploaded(null);
      setUploadError(error.message);
    }
  };

  const upload = async () => {
    if (!file || uploaded) return;
    setUploadError('');
    setUploadStage('Preparing SHA-256 digest…');
    try {
      const result = await uploadEvidenceFile(file, {
        onProgress: ({ stage }) => {
          setUploadStage(stage === 'hashing' ? 'Computing SHA-256 digest…' : 'Uploading to the configured IPFS node…');
        },
      });
      setUploaded(result);
      setUploadStage('Evidence uploaded and ready to associate with this milestone.');
    } catch (error) {
      setUploadStage('');
      setUploadError(error.message);
    }
  };

  const submit = async () => {
    const reference = uploaded?.reference || manualReference.trim();
    if (!reference || !onSubmitEvidence) return;
    if (new TextEncoder().encode(reference).length > 512) {
      setUploadError('Evidence references must be no more than 512 UTF-8 bytes.');
      return;
    }
    setUploadError('');
    try {
      const receipt = await onSubmitEvidence(planId, milestoneIndex, reference);
      if (receipt?.hash) {
        setSubmissionTxHash(receipt.hash);
        setUploadStage(`Evidence reference confirmed in transaction ${receipt.hash}`);
      } else {
        setUploadError('The transaction was not confirmed. The uploaded file remains an unsent draft.');
      }
    } catch (error) {
      setUploadError(error.message || 'Evidence submission did not complete.');
    }
  };

  const verify = async () => {
    setVerificationBusy(true);
    setVerification(null);
    try {
      setVerification(await verifyEvidenceReference(savedReference));
    } catch (error) {
      setVerification({ status: 'failed', message: error.message || 'Evidence verification failed.' });
    } finally {
      setVerificationBusy(false);
    }
  };

  const copyCid = async (cid) => {
    try {
      await copyText(cid);
      setCopyStatus('CID copied.');
    } catch (error) {
      setCopyStatus(error.message);
    }
  };

  if (isSubmitted) {
    return (
      <div className="mt-3 space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="flex items-start gap-2 text-xs text-slate-300">
          <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
          <div className="min-w-0">
            <p className="font-medium text-slate-100">Recorded evidence reference</p>
            <p className="mt-1 break-all font-mono">{savedReference}</p>
            {parsedSavedReference && (
              <p className="mt-1 break-all text-slate-400">SHA-256: {parsedSavedReference.sha256}</p>
            )}
          </div>
        </div>
        {parsedSavedReference && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" icon={ShieldAlert} onClick={verify} isLoading={verificationBusy}>
              Verify retrieved file
            </Button>
            <Button size="sm" variant="ghost" icon={Copy} onClick={() => copyCid(parsedSavedReference.cid)}>
              Copy CID
            </Button>
          </div>
        )}
        {verification && (
          <p role="status" className={`break-words text-xs ${VERIFICATION_STYLES[verification.status]}`}>
            {verification.status === 'verified' ? 'Integrity verified. ' : ''}
            {verification.status === 'mismatch' ? 'Integrity mismatch. ' : ''}
            {verification.status === 'unavailable' ? 'Evidence unavailable. ' : ''}
            {verification.status === 'failed' ? 'Verification failed. ' : ''}
            {verification.message}
          </p>
        )}
        {verification?.actualSha256 && (
          <p className="break-all text-[11px] text-slate-400">
            Retrieved SHA-256: {verification.actualSha256}
          </p>
        )}
        {submissionTxHash ? (
          <p className="break-all text-[11px] text-slate-400">Submission transaction: {submissionTxHash}</p>
        ) : (
          <p className="text-[11px] text-slate-500">
            The confirmed MilestoneSubmitted transaction is available in the Treasury Audit Explorer.
          </p>
        )}
        <p className="text-[11px] text-slate-500">
          A matching digest establishes file integrity only; it does not prove the evidence is truthful or the work was completed.
        </p>
      </div>
    );
  }

  if (!isRecipient) return null;

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="space-y-1 text-xs text-amber-200">
        <p className="font-medium">Evidence privacy notice</p>
        <p>
          IPFS content may be publicly discoverable and is not guaranteed to remain available. Do not upload confidential or personal documents.
        </p>
      </div>
      <p className="text-[11px] text-slate-400">
        IPFS upload service: {ipfsConfiguration.apiUrl ? 'configured' : 'not configured'} ·
        retrieval gateway: {ipfsConfiguration.gatewayUrl ? 'configured' : 'not configured'}.
        Wallet confirmation is required only to record the reference on-chain.
      </p>
      <label className="block space-y-1.5">
        <span className="block text-xs font-medium text-slate-300">Select evidence file (10 MiB maximum)</span>
        <input
          type="file"
          accept={[...ALLOWED_EVIDENCE_TYPES].join(',')}
          disabled={Boolean(uploaded) || isSubmitting}
          onChange={chooseFile}
          className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:text-slate-100 disabled:opacity-50"
        />
      </label>
      {file && <p className="text-xs text-slate-400">Selected locally: {file.name} ({file.size.toLocaleString()} bytes)</p>}
      {file && !uploaded && (
        <Button size="sm" variant="outline" icon={Upload} onClick={upload} disabled={isSubmitting}>
          Upload to configured IPFS node
        </Button>
      )}
      {uploaded && (
        <div className="space-y-2 rounded-lg border border-emerald-900/70 bg-emerald-950/20 p-3 text-xs">
          <p className="break-all"><span className="text-slate-400">CID: </span><span className="font-mono text-slate-100">{uploaded.cid}</span></p>
          <p className="break-all"><span className="text-slate-400">SHA-256: </span><span className="font-mono text-slate-100">{uploaded.sha256}</span></p>
          <p className="break-all"><span className="text-slate-400">Milestone reference: </span><span className="font-mono text-slate-100">{uploaded.reference}</span></p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={Copy} onClick={() => copyCid(uploaded.cid)}>Copy CID</Button>
            <Button size="sm" variant="ghost" icon={X} onClick={() => {
              setUploaded(null);
              setFile(null);
              setUploadStage('');
              setCopyStatus('');
            }}>
              Remove unsent draft
            </Button>
          </div>
        </div>
      )}
      {!uploaded && (
        <div>
          <p className="mb-2 text-[11px] text-slate-500">Or submit a legacy off-chain reference (it will not have an automatic integrity digest).</p>
          <Textarea
            label="Existing evidence reference"
            rows={2}
            maxLength={512}
            value={manualReference}
            onChange={(event) => setManualReference(event.target.value)}
            placeholder="IPFS reference or other off-chain URL"
          />
        </div>
      )}
      {uploadStage && <p role="status" className="break-all text-xs text-indigo-300">{uploadStage}</p>}
      {uploadError && <p role="alert" className="break-words text-xs text-rose-300">{uploadError}</p>}
      {copyStatus && <p role="status" className="text-xs text-slate-400">{copyStatus}</p>}
      {(uploaded || manualReference.trim()) && (
        <Button
          size="sm"
          icon={Check}
          onClick={submit}
          isLoading={isSubmitting}
          disabled={!isConnected || !isCorrectNetwork || isSubmitting}
        >
          Submit evidence for plan {planId.slice(0, 10)}… milestone {milestoneIndex + 1}
        </Button>
      )}
    </div>
  );
}
