'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  FileText,
  Upload,
  Trash2,
  Download,
  Loader2,
  Eye,
  EyeOff,
  Plus,
  X,
  FileImage,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

const DOC_TYPES = [
  { value: 'prospectus', label: 'Prospectus' },
  { value: 'term_sheet', label: 'Term Sheet' },
  { value: 'investor_presentation', label: 'Investor Presentation' },
  { value: 'legal_agreement', label: 'Legal Agreement' },
  { value: 'other', label: 'Other' },
] as const;

type DocType = (typeof DOC_TYPES)[number]['value'];

const TYPE_COLORS: Record<string, string> = {
  prospectus: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  term_sheet: 'bg-violet-500/10 text-violet-400 border border-violet-500/20',
  investor_presentation: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  legal_agreement: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  other: 'bg-slate-800 text-slate-400 border border-slate-700',
};

interface TokenDoc {
  id: string;
  name: string;
  type: DocType;
  visibility: 'public' | 'private';
  fileUrl: string | null;
  originalName: string;
  mimeType: string;
  fileSize: string;
  uploadedBy: string | null;
  createdAt: string;
}

function formatBytes(bytes: string | number): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime === 'application/pdf') return <FileText className="h-8 w-8 text-rose-400" />;
  if (mime.includes('word')) return <FileText className="h-8 w-8 text-blue-400" />;
  return <FileImage className="h-8 w-8 text-slate-400" />;
}

export default function TokenDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const headers = user?.id ? { 'x-user-id': user.id } : {};

  const [docs, setDocs] = useState<TokenDoc[]>([]);
  const [tokenName, setTokenName] = useState('');
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  // Upload form state
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState<DocType>('other');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    try {
      const [tokenRes, docsRes] = await Promise.all([
        api.get(`/tokens/${id}`),
        api.get(`/tokens/${id}/documents`, { headers }),
      ]);
      setTokenName(tokenRes.data?.data?.name ?? '');
      setDocs(docsRes.data?.data ?? []);
    } catch {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(f.type)) {
      toast.error('Only PDF and DOCX files are allowed');
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      toast.error('File must be smaller than 50 MB');
      return;
    }
    setFile(f);
    if (!docName) setDocName(f.name.replace(/\.[^.]+$/, ''));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { toast.error('Please select a file'); return; }
    if (!docName.trim()) { toast.error('Please enter a document name'); return; }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', docName.trim());
      formData.append('type', docType);
      formData.append('visibility', visibility);

      await api.post(`/tokens/${id}/documents`, formData, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Document uploaded successfully');
      setShowUpload(false);
      setFile(null);
      setDocName('');
      setDocType('other');
      setVisibility('private');
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadDocs();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await api.delete(`/tokens/${id}/documents/${docId}`, { headers });
      toast.success('Document deleted');
      loadDocs();
    } catch {
      toast.error('Failed to delete document');
    }
  };

  const downloadUrl = (doc: TokenDoc) =>
    `${process.env.NEXT_PUBLIC_API_URL}/tokens/${id}/documents/${doc.id}/download`;

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/issuer/tokens/${id}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-ink">Token Documents</h1>
            <p className="text-sm text-slate-400">{tokenName || 'Manage disclosures & legal records'}</p>
          </div>
        </div>
        <button
          onClick={() => setShowUpload(v => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg hover:-translate-y-0.5 transition-all"
        >
          <Plus className="h-4 w-4" />
          Upload Document
        </button>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-ink">Upload New Document</h2>
            <button
              onClick={() => setShowUpload(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-ink transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleUpload} className="space-y-4">
            {/* File drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
 file
 ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-700 bg-slate-800/40 hover:border-cyan-500/50 hover:bg-slate-800/70' }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileChange}
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-10 w-10 text-emerald-400" />
                  <p className="font-medium text-ink">{file.name}</p>
                  <p className="text-xs text-slate-400">{formatBytes(file.size)}</p>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-xs text-red-400 hover:underline mt-1"
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-10 w-10 text-slate-500" />
                  <p className="text-sm font-medium text-slate-300">Click to select a file</p>
                  <p className="text-xs text-slate-500">PDF or DOCX · Max 50 MB</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Document Name *
                </label>
                <input
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  placeholder="e.g. Prospectus 2026"
                  value={docName}
                  onChange={e => setDocName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Document Type
                </label>
                <select
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  value={docType}
                  onChange={e => setDocType(e.target.value as DocType)}
                >
                  {DOC_TYPES.map(t => <option key={t.value} value={t.value} className="bg-slate-900 text-ink">{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Visibility
                </label>
                <select
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-ink focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  value={visibility}
                  onChange={e => setVisibility(e.target.value as 'public' | 'private')}
                >
                  <option value="private" className="bg-slate-900 text-ink">Private (issuer only)</option>
                  <option value="public" className="bg-slate-900 text-ink">Public (investors can view)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading || !file}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-slate-950 shadow-lg disabled:cursor-not-allowed disabled:opacity-40 transition-all"
              >
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center">
          <p className="text-2xl font-bold text-ink">{docs.length}</p>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Total Documents</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{docs.filter(d => d.visibility === 'public').length}</p>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Public</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center">
          <p className="text-2xl font-bold text-cyan-400">{docs.filter(d => d.visibility === 'private').length}</p>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Private</p>
        </div>
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <FileText className="h-12 w-12 text-slate-600" />
          <p className="mt-3 font-medium text-ink">No documents yet</p>
          <p className="text-sm text-slate-400">Upload your prospectus, term sheets, and legal agreements</p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg"
          >
            <Upload className="h-4 w-4" /> Upload Document
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="divide-y divide-slate-800/70">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-800/40 transition-colors">
                {/* Icon */}
                <div className="shrink-0">
                  <FileIcon mime={doc.mimeType} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-ink truncate">{doc.name}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLORS[doc.type] ?? TYPE_COLORS.other}`}>
                      {DOC_TYPES.find(t => t.value === doc.type)?.label ?? doc.type}
                    </span>
                    <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
 doc.visibility === 'public' ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border border-slate-700 bg-slate-800 text-slate-400' }`}>
                      {doc.visibility === 'public'
                        ? <><Eye className="h-3 w-3" /> Public</>
                        : <><EyeOff className="h-3 w-3" /> Private</>}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {doc.originalName} · {formatBytes(doc.fileSize)} · {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={downloadUrl(doc)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-ink transition-colors"
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <button
                    onClick={() => handleDelete(doc.id, doc.name)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <p className="text-xs text-slate-500">
        Public documents are visible to verified investors on their token detail page.
        Private documents are only visible to issuers and admins.
      </p>
    </div>
  );
}
