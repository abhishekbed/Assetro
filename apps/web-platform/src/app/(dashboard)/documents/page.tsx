'use client';

import { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Download,
  Upload,
  Loader2,
  X,
  FileImage,
  FileCheck,
  MapPin,
  User,
  FolderOpen,
} from 'lucide-react';
import clsx from 'clsx';
import api from '@/lib/api';
import { getMediaUrl } from '@/lib/media';
import { useAuthStore } from '@/store/auth.store';

interface Document {
  id: string;
  fileName: string;
  fileUrl?: string;
  type?: string;
  documentType?: string;
  uploadedAt?: string;
  createdAt?: string;
  status?: string;
}

const typeLabels: Record<string, { label: string; color: string; icon: typeof FileText }> = {
  id_proof: { label: 'ID Proof', color: 'bg-accent-soft text-accent', icon: FileCheck },
  identity: { label: 'ID Proof', color: 'bg-accent-soft text-accent', icon: FileCheck },
  address_proof: { label: 'Address Proof', color: 'bg-accent-soft text-accent', icon: MapPin },
  address: { label: 'Address Proof', color: 'bg-accent-soft text-accent', icon: MapPin },
  selfie: { label: 'Selfie', color: 'bg-warning-100 text-warning', icon: User },
  photo: { label: 'Selfie', color: 'bg-warning-100 text-warning', icon: User },
};

function getTypeInfo(type: string) {
  if (!type) return { label: 'Unknown', color: 'bg-surface-header text-ink', icon: FileText };
  const key = type.toLowerCase().replace(/\s+/g, '_');
  return (
    typeLabels[key] || { label: type, color: 'bg-surface-header text-ink', icon: FileText }
  );
}

const statusColors: Record<string, string> = {
  verified: 'bg-success-100 text-success',
  approved: 'bg-success-100 text-success',
  pending: 'bg-warning-100 text-warning',
  rejected: 'bg-danger-100 text-danger',
};

export default function DocumentsPage() {
  const { user } = useAuthStore();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState('passport');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchDocuments() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const res = await api.get('/kyc/profile');
        const profile = res.data?.data || null;
        setProfileId(profile?.id || null);
        setDocuments(profile?.documents || []);
      } catch {
        setProfileId(null);
        setDocuments([]);
      } finally {
        setLoading(false);
      }
    }
    fetchDocuments();
  }, [user?.id]);

  const handleDownload = async (doc: Document) => {
    try {
      const response = await api.get('/kyc/documents/' + doc.id + '/download');
      const url = response.data?.data?.url;
      if (!url) throw new Error('No download URL');
      const fileUrl = getMediaUrl(url);
      const saveAs = (href: string) => {
        const a = document.createElement('a');
        a.href = href;
        a.download = doc.fileName || 'document';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      };
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error('fetch failed');
        const blobUrl = URL.createObjectURL(await res.blob());
        saveAs(blobUrl);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
      } catch {
        // CORS-blocked: fall back to a direct link with the download attribute
        saveAs(fileUrl);
      }
    } catch {
      setError('Download failed. Please try again.');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id || !profileId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('profile_id', profileId);
      formData.append('document_type', documentType);

      await api.post('/kyc/profile/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Refresh documents
      const res = await api.get('/kyc/profile');
      const profile = res.data?.data || null;
      setProfileId(profile?.id || null);
      setDocuments(profile?.documents || []);
      setShowUploadModal(false);
    } catch {
      setError('Upload failed. This feature may not be available yet.');
      setTimeout(() => setError(null), 3000);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
        <span className="ml-3 text-muted">Loading documents...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Document Vault</h1>
          <p className="text-muted">Manage your KYC and compliance documents</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="btn-primary gap-2"
          disabled={!profileId}
        >
          <Upload className="h-4 w-4" />
          Upload Document
        </button>
      </div>

      {/* Error notification */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger bg-danger-100 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Empty state */}
      {documents.length === 0 && (
        <div className="card p-12 text-center">
          <FolderOpen className="mx-auto h-16 w-16 text-muted" />
          <h3 className="mt-4 text-lg font-medium text-ink">No documents uploaded yet</h3>
          <p className="mt-2 text-sm text-muted">
            Upload your KYC documents to get started with identity verification.
          </p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="btn-primary mt-6 gap-2"
            disabled={!profileId}
          >
            <Upload className="h-4 w-4" />
            Upload Your First Document
          </button>
          {!profileId && (
            <p className="mt-3 text-xs text-warning">
              Submit your KYC application first to create a document vault.
            </p>
          )}
        </div>
      )}

      {/* Document grid */}
      {documents.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => {
            const typeInfo = getTypeInfo(doc.documentType || doc.type || '');
            const TypeIcon = typeInfo.icon;
            const uploadDate = doc.uploadedAt || doc.createdAt;

            return (
              <div key={doc.id} className="card p-5">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card">
                    <TypeIcon className="h-5 w-5 text-muted" />
                  </div>
                  <span
                    className={clsx(
                      'inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                      statusColors[doc.status || 'pending'] || 'bg-surface-header text-ink'
                    )}
                  >
                    {doc.status || 'pending'}
                  </span>
                </div>

                <div className="mt-3">
                  <p className="text-sm font-medium text-ink truncate" title={doc.fileName}>
                    {doc.fileName}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', typeInfo.color)}>
                      {typeInfo.label}
                    </span>
                  </div>
                  {uploadDate && (
                    <p className="mt-2 text-xs text-muted">
                      Uploaded {new Date(uploadDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleDownload(doc)}
                  className="btn-secondary mt-4 w-full gap-2 text-sm"
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card mx-4 w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-ink">Upload Document</h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="rounded-lg p-1 text-muted hover:bg-surface-header"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label mb-1 block">Document Type</label>
                <select
                  value={documentType}
                  onChange={(event) => setDocumentType(event.target.value)}
                  className="input-field"
                >
                  <option value="passport">Passport</option>
                  <option value="national_id">National ID</option>
                  <option value="drivers_license">Driver&apos;s License</option>
                  <option value="proof_of_address">Proof of Address</option>
                  <option value="accreditation_proof">Accreditation Proof</option>
                  <option value="selfie">Selfie</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-line p-8 transition-colors hover:border-accent hover:bg-accent-soft"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileImage className="h-10 w-10 text-muted" />
                <p className="mt-2 text-sm font-medium text-ink">
                  Click to select a file
                </p>
                <p className="mt-1 text-xs text-muted">
                  PDF, JPG, PNG up to 10MB
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={handleUpload}
              />

              {uploading && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowUploadModal(false)}
                className="btn-secondary"
                disabled={uploading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
