'use client';

import { useState, useEffect, Suspense, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  CheckCircle,
  Clock,
  XCircle,
  Upload,
  FileText,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Coins,
  Plus,
  Shield,
  RefreshCw,
  ChevronRight,
  Wallet,
  Link2,
  X,
  MinusCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

// ── Types ─────────────────────────────────────────────────────────────────────

interface InvestorProfile {
  id: string;
  userId: string;
  fullName: string;
  dateOfBirth: string;
  nationality: string;
  country: string;
  addressLine1: string;
  city: string;
  postalCode: string;
  investorType: string;
  accreditation: string;
  adminKycStatus?: string | null;
  adminReason?: string | null;
  extraData?: {
    phone?: string;
    tax_id?: string;
    company_name?: string;
    company_registration?: string;
    company_country?: string;
  } | null;
  submittedAt: string;
}

interface Qualification {
  id: string;
  issuerId: string;
  investorId: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'expired';
  rejectedReason?: string;
  reviewNotes?: string;
  approvedAt?: string;
  expiresAt?: string;
  createdAt: string;
  blockchainStatus?: string;
  blockchainError?: string;
  blockchainCompletedAt?: string;
}

interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  assetType?: string;
  createdBy: string; // issuerId
}

interface ChainClaim {
  topic: number;
  topic_name: string;
  claim_id: string;
  exists_on_chain: boolean;
  signature_valid: boolean;
  issuer_trusted: boolean;
}

interface ChainTokenStatus {
  token_id: string;
  ir_address: string;
  is_verified: boolean;
  registered_identity: string | null;
  country_code: number;
}

interface ChainVerification {
  wallet_address: string;
  fully_verified: boolean;
  identity_address: string | null;
  contract_deployed: boolean;
  identity_address_match: boolean;
  claims: ChainClaim[];
  token_whitelist_status: ChainTokenStatus[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  // Personal
  full_name: z.string().min(2, 'Required').max(255),
  date_of_birth: z.string().min(1, 'Required'),
  nationality: z.string().min(1, 'Required'),
  phone: z.string().min(7, 'Enter a valid phone number').max(20).optional().or(z.literal('')),
  tax_id: z.string().max(50).optional().or(z.literal('')),
  // Address
  country: z.string().min(1, 'Required'),
  address_line1: z.string().min(1, 'Required').max(500),
  city: z.string().min(1, 'Required'),
  postal_code: z.string().min(1, 'Required').max(20),
  // Investor classification
  investor_type: z.enum(['individual', 'institutional', 'accredited']),
  is_accredited: z.boolean().optional(),
  accreditation: z.enum(['none', 'self_certified', 'verified']).optional(),
  // Institutional only
  company_name: z.string().max(255).optional().or(z.literal('')),
  company_registration: z.string().max(100).optional().or(z.literal('')),
  company_country: z.string().max(2).optional().or(z.literal('')),
  // Documents
  document_type: z.string().optional().or(z.literal('')),
  terms_agreed: z.boolean().optional(),
});
type ProfileForm = z.infer<typeof profileSchema>;

const STATUS_CONFIG = {
  pending:      { icon: Clock,       color: 'text-warning', badge: 'badge-warning', border: 'border-line',   label: 'Pending Review' },
  under_review: { icon: Clock,       color: 'text-accent',  badge: 'badge-neutral', border: 'border-line',   label: 'Under Review' },
  approved:     { icon: CheckCircle, color: 'text-success', badge: 'badge-success', border: 'border-line',   label: 'Approved' },
  rejected:     { icon: XCircle,     color: 'text-danger',  badge: 'badge-danger',  border: 'border-danger', label: 'Rejected' },
  expired:      { icon: AlertCircle, color: 'text-muted',   badge: 'badge-neutral', border: 'border-line',   label: 'Expired' },
};

// ── Main Component ────────────────────────────────────────────────────────────

function KycPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenId = searchParams.get('token_id') || '';
  const isEditParam = searchParams.get('edit') === '1';
  const { user, setUser } = useAuthStore();

  const [profile, setProfile] = useState<InvestorProfile | null>(null);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [requestingQual, setRequestingQual] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initializedFormRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [chainVerification, setChainVerification] = useState<ChainVerification | null>(null);
  const [chainLoading, setChainLoading] = useState(false);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      investor_type: 'individual',
      is_accredited: false,
      accreditation: 'none',
      document_type: 'passport',
      terms_agreed: true,
    },
  });
  const investorType = watch('investor_type');
  const isAccredited = watch('is_accredited');

  const populateForm = useCallback((p: InvestorProfile) => {
    reset({
      full_name: p.fullName || '',
      date_of_birth: p.dateOfBirth ? p.dateOfBirth.split('T')[0] : '',
      nationality: p.nationality || '',
      phone: p.extraData?.phone || '',
      tax_id: p.extraData?.tax_id || '',
      country: p.country || '',
      address_line1: p.addressLine1 || '',
      city: p.city || '',
      postal_code: p.postalCode || '',
      investor_type: (p.investorType as any) || 'individual',
      is_accredited: p.accreditation !== 'none' && p.accreditation !== undefined,
      accreditation: (p.accreditation as any) || 'none',
      company_name: p.extraData?.company_name || '',
      company_registration: p.extraData?.company_registration || '',
      company_country: p.extraData?.company_country || '',
      document_type: 'passport',
      terms_agreed: true,
    });
  }, [reset]);

  const startEditing = useCallback(() => {
    if (profile) {
      populateForm(profile);
    }
    setIsEditing(true);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('edit', '1');
    router.push(nextParams.toString() ? `/kyc?${nextParams.toString()}` : '/kyc?edit=1');
  }, [profile, populateForm, searchParams, router]);

  const cancelEditing = useCallback(() => {
    if (profile) {
      populateForm(profile);
    }
    setPendingFiles([]);
    setSubmitError(null);
    setIsEditing(false);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('edit');
    const q = nextParams.toString();
    router.replace(q ? `/kyc?${q}` : '/kyc');
  }, [profile, populateForm, searchParams, router]);

  const load = useCallback(async () => {
    try {
      const [profileRes, qualsRes] = await Promise.allSettled([
        api.get('/kyc/profile'),
        api.get('/kyc/my-qualifications'),
      ]);
      if (profileRes.status === 'fulfilled') {
        const p: InvestorProfile | null = profileRes.value.data?.data ?? null;
        setProfile(p);
        if (p && !initializedFormRef.current) {
          initializedFormRef.current = true;
          populateForm(p);
        }
      }
      if (qualsRes.status === 'fulfilled') {
        const quals: Qualification[] = qualsRes.value.data?.data ?? [];
        setQualifications(quals);

        // Derive and sync the investor's global KYC status to the auth store
        // so the dashboard and token pages reflect the correct state immediately.
        let derived: 'none' | 'pending' | 'approved' | 'rejected' = 'none';
        if (quals.some((q) => q.status === 'approved')) derived = 'approved';
        else if (quals.some((q) => q.status === 'pending' || q.status === 'under_review')) derived = 'pending';
        else if (quals.length > 0) derived = 'rejected';

        const { user: currentUser, setUser, bumpKycRefresh } = useAuthStore.getState();
        if (currentUser) {
          setUser({ ...currentUser, kycStatus: derived });
        }
        bumpKycRefresh();
      }
    } finally {
      setPageLoading(false);
    }
  }, [populateForm]);

  useEffect(() => { load(); }, [load]);

  // Fetch real on-chain identity state whenever an approved qualification exists and a wallet is linked
  useEffect(() => {
    const wallet = user?.walletAddress;
    const hasApprovedQual = qualifications.some(q => q.status === 'approved');

    if (!wallet || !wallet.match(/^0x[0-9a-fA-F]{40}$/) || !hasApprovedQual) {
      setChainVerification(null);
      return;
    }

    setChainVerification((prev) => { if (!prev) setChainLoading(true); return prev; });
    api.get(`/blockchain/verify/${wallet}`)
      .then(r => setChainVerification(r.data?.data || null))
      .catch(() => setChainVerification(null))
      .finally(() => setChainLoading(false));
  }, [qualifications, user?.walletAddress]);

  useEffect(() => {
    if (!tokenId) return;
    api.get(`/tokens/${tokenId}`)
      .then((r) => setToken(r.data?.data || r.data || null))
      .catch(() => setToken(null));
  }, [tokenId]);

  useEffect(() => {
    const hasWorkInProgress = qualifications.some((q) =>
      q.status === 'pending' ||
      q.status === 'under_review' ||
      (q.status === 'approved' && q.blockchainStatus !== 'completed' && q.blockchainStatus !== 'failed')
    );

    if (!hasWorkInProgress) return;

    const interval = window.setInterval(() => {
      load();
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [load, qualifications]);

  const addFiles = (files: FileList | null) => {
    if (files && files.length > 0) setPendingFiles((p) => [...p, ...Array.from(files)]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    // Let the same file be picked again after it is removed.
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer?.files) {
      addFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) =>
    setPendingFiles((p) => p.filter((_, i) => i !== index));

  const formatBytes = (bytes: number) =>
    bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  const uploadDocuments = async (profileId: string, documentType: string) => {
    for (const file of pendingFiles) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('profile_id', profileId);
      fd.append('document_type', documentType);
      await api.post('/kyc/profile/documents', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
  };

  const isEditMode = (isEditing || isEditParam) && !!profile;
  const showForm = !profile || isEditMode;

  const onSubmit = async (data: ProfileForm) => {
    if (!profile && !data.terms_agreed) {
      setSubmitError('You must agree to the ONCHAINID Terms & Conditions to submit your profile.');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError(null);
      const res = await api.post('/kyc/profile', {
        full_name: data.full_name,
        date_of_birth: data.date_of_birth,
        nationality: data.nationality,
        country: data.country,
        address_line1: data.address_line1,
        city: data.city,
        postal_code: data.postal_code,
        investor_type: data.investor_type,
        // Map is_accredited checkbox to accreditation enum
        accreditation: data.is_accredited ? 'self_certified' : (data.accreditation || 'none'),
        terms_agreed: data.terms_agreed ?? true,
        // New fields
        phone: data.phone || undefined,
        tax_id: data.tax_id || undefined,
        ...(data.investor_type === 'institutional' && {
          company_name: data.company_name || undefined,
          company_registration: data.company_registration || undefined,
          company_country: data.company_country || undefined,
        }),
      });
      const savedProfile: InvestorProfile = res.data?.data;
      setProfile(savedProfile);
      if (user) {
        setUser({ ...user, name: data.full_name });
      }

      if (pendingFiles.length > 0) {
        await uploadDocuments(savedProfile.id, data.document_type || 'passport');
        setPendingFiles([]);
      }

      if (isEditMode) {
        toast.success('KYC Profile updated successfully!');
        setIsEditing(false);
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.delete('edit');
        const query = nextParams.toString();
        router.replace(query ? `/kyc?${query}` : '/kyc');
        await load();
        return;
      }

      // If we came from a token page, auto-request qualification for that issuer
      if (token?.createdBy && savedProfile) {
        try {
          await api.post(`/kyc/qualify/${token.createdBy}`);
        } catch {
          // ConflictException = already requested — OK
        }
      }

      await load();
      setSubmitSuccess(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string | string[] } } };
      const msg = axiosErr.response?.data?.message;
      setSubmitError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Failed to submit KYC profile.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestQualification = async (issuerId: string) => {
    setRequestingQual(true);
    try {
      await api.post(`/kyc/qualify/${issuerId}`);
      await load();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const msg = axiosErr.response?.data?.message;
      if (!msg?.includes('already')) {
        alert(msg || 'Failed to request qualification.');
      } else {
        await load();
      }
    } finally {
      setRequestingQual(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="space-y-6 pb-10">
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-surface-header" />
          <div className="h-8 w-64 animate-pulse rounded bg-surface-header" />
        </div>
        <div className="h-20 animate-pulse rounded-card bg-surface-header" />
        <div className="h-40 animate-pulse rounded-card bg-surface-header" />
        <div className="h-32 animate-pulse rounded-card bg-surface-header" />
      </div>
    );
  }

  // ── Post-submit success screen ───────────────────────────────────────────────
  if (submitSuccess) {
    const issuerQual = token
      ? qualifications.find((q) => q.issuerId === token.createdBy)
      : null;

    return (
      <div className="space-y-6">
        {tokenId && (
          <Link href={`/tokens/${tokenId}`} className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
            Back to Token
          </Link>
        )}
        <div className="card flex flex-col items-center p-8 text-center">
          <div className="icon-chip h-14 w-14 bg-success-100 text-success">
            <CheckCircle className="h-7 w-7" />
          </div>
          <h2 className="page-title mt-4">KYC Profile Submitted</h2>
          <p className="mt-2 max-w-md text-muted">
            Your global identity profile has been created.
            {issuerQual
              ? ' Your qualification request has been sent to the issuer.'
              : token
              ? ' Request a qualification from the issuer to invest in this token.'
              : ' You can now request qualification from any issuer.'}
          </p>
          {token && !issuerQual && (
            <button
              onClick={() => handleRequestQualification(token.createdBy)}
              disabled={requestingQual}
              className="btn-primary mt-6 inline-flex items-center gap-2"
            >
              {requestingQual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              Request Qualification from Issuer
            </button>
          )}
          {(issuerQual || !token) &&
            (tokenId ? (
              <Link href={`/tokens/${tokenId}`} className="btn-primary mt-6 inline-flex items-center gap-2">
                {`Back to ${token?.name ?? 'Token'}`}
              </Link>
            ) : (
              // Already on /kyc, so a link would be a no-op. Leave the success
              // screen to show the profile and qualifications view.
              <button
                type="button"
                onClick={() => {
                  setSubmitSuccess(false);
                  window.scrollTo({ top: 0 });
                }}
                className="btn-primary mt-6 inline-flex items-center gap-2"
              >
                View My Qualifications
              </button>
            ))}
        </div>
      </div>
    );
  }

  // ── Show KYC form (for new registration or editing existing profile) ─────────
  if (showForm) {
    const tokenBanner = token ? (
      <div className="panel panel-highlight flex items-center gap-3 p-4">
        <span className="icon-chip">
          <Coins className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium text-ink">
            Investing in <strong>{token.name} ({token.symbol})</strong>
          </p>
          <p className="text-xs text-muted">
            Complete your KYC profile once — it will be reused for all future investments.
          </p>
        </div>
      </div>
    ) : null;

    return (
      <div className="space-y-6">
        {tokenId && (
          <Link href={`/tokens/${tokenId}`} className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
            Back to Token
          </Link>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="kicker mb-2">{isEditMode ? 'Settings' : 'Verification'}</p>
            <h1 className="page-title">{isEditMode ? 'Update KYC Profile' : 'Complete KYC Profile'}</h1>
            <p className="mt-1 text-muted">
              {isEditMode
                ? 'Update your personal details and investor classification'
                : 'Submit your identity verification once — reused across all issuers'}
            </p>
          </div>
          {isEditMode && (
            <button
              type="button"
              onClick={cancelEditing}
              className="btn-secondary"
            >
              Cancel
            </button>
          )}
        </div>

        {tokenBanner}

        {submitError && (
          <div className="panel flex items-center gap-3 border-danger bg-danger-100 p-4">
            <AlertCircle className="h-5 w-5 shrink-0 text-danger" />
            <p className="text-sm text-danger">{submitError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <FormSection step={1} title="Personal Information" hint="As shown on your identity document">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="label mb-1">Full Name</label>
                <input className="input-field" placeholder="John Doe" {...register('full_name')} />
                {errors.full_name && <p className="mt-1 text-xs text-danger">{errors.full_name.message}</p>}
              </div>
              <div>
                <label className="label mb-1">Date of Birth</label>
                <input type="date" className="input-field" {...register('date_of_birth')} />
                {errors.date_of_birth && <p className="mt-1 text-xs text-danger">{errors.date_of_birth.message}</p>}
              </div>
              <div>
                <label className="label mb-1">Nationality</label>
                <input className="input-field" placeholder="e.g. Indian" {...register('nationality')} />
                {errors.nationality && <p className="mt-1 text-xs text-danger">{errors.nationality.message}</p>}
              </div>
              <div>
                <label className="label mb-1">Phone Number</label>
                <input className="input-field" placeholder="+91 98765 43210" {...register('phone')} />
                {errors.phone && <p className="mt-1 text-xs text-danger">{errors.phone.message}</p>}
              </div>
              <div>
                <label className="label mb-1">Tax ID / PAN Number</label>
                <input className="input-field" placeholder="e.g. ABCDE1234F" {...register('tax_id')} />
                <p className="mt-0.5 text-xs text-muted">Used for regulatory reporting only</p>
              </div>
            </div>
          </FormSection>

          <FormSection step={2} title="Address" hint="Your current residential address">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="label mb-1">Street Address</label>
                <input className="input-field" {...register('address_line1')} />
                {errors.address_line1 && <p className="mt-1 text-xs text-danger">{errors.address_line1.message}</p>}
              </div>
              <div>
                <label className="label mb-1">City</label>
                <input className="input-field" {...register('city')} />
                {errors.city && <p className="mt-1 text-xs text-danger">{errors.city.message}</p>}
              </div>
              <div>
                <label className="label mb-1">Country</label>
                <input className="input-field" placeholder="IN" maxLength={2} {...register('country')} />
                {errors.country
                  ? <p className="mt-1 text-xs text-danger">{errors.country.message}</p>
                  : <p className="mt-0.5 text-xs text-muted">Two-letter ISO code, e.g. IN or US</p>}
              </div>
              <div>
                <label className="label mb-1">Postal Code</label>
                <input className="input-field" {...register('postal_code')} />
                {errors.postal_code && <p className="mt-1 text-xs text-danger">{errors.postal_code.message}</p>}
              </div>
            </div>
          </FormSection>

          <FormSection
            step={3}
            title="Investor Classification"
            hint="Determines which offerings you are eligible for"
          >
            {/* Investor type — radio buttons */}
            <div className="mb-5">
              <label className="label mb-2">Investor Type</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { value: 'individual', label: 'Individual', desc: 'Natural person investing personally' },
                  { value: 'institutional', label: 'Institutional', desc: 'Company, fund or organisation' },
                  { value: 'accredited', label: 'Accredited', desc: 'Meets accredited investor criteria' },
                ].map(opt => (
                  <label key={opt.value}
                    className={`panel flex cursor-pointer items-start gap-3 p-4 transition-colors ${
                      investorType === opt.value
                        ? 'panel-highlight bg-accent-soft'
                        : 'hover:bg-surface-header'
                    }`}
                  >
                    <input type="radio" value={opt.value} {...register('investor_type')} className="mt-0.5 accent-accent" />
                    <div>
                      <p className="text-sm font-medium text-ink">{opt.label}</p>
                      <p className="text-xs text-muted">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              {errors.investor_type && <p className="mt-1 text-xs text-danger">{errors.investor_type.message}</p>}
            </div>

            {/* Accredited investor checkbox */}
            <label className="panel flex cursor-pointer items-start gap-3 p-4">
              <input type="checkbox" {...register('is_accredited')} className="mt-0.5 h-4 w-4 rounded accent-accent" />
              <div>
                <p className="text-sm font-medium text-ink">
                  I am an Accredited Investor
                  {isAccredited && <span className="badge-success ml-2">Selected</span>}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  You qualify if: (a) annual income &gt; $200,000, or (b) net worth &gt; $1M excluding primary residence,
                  or (c) licensed financial professional. This affects which tokens you can invest in.
                </p>
              </div>
            </label>

            {/* Institutional fields — shown only when institutional is selected */}
            {investorType === 'institutional' && (
              <div className="panel mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 p-4 bg-surface-header">
                <p className="md:col-span-2 text-sm font-medium text-ink">Organisation Details</p>
                <div className="md:col-span-2">
                  <label className="label mb-1">Company / Organisation Name</label>
                  <input className="input-field" placeholder="Acme Capital Partners Ltd." {...register('company_name')} />
                  {errors.company_name && <p className="mt-1 text-xs text-danger">{errors.company_name.message}</p>}
                </div>
                <div>
                  <label className="label mb-1">Registration / CIN Number</label>
                  <input className="input-field" placeholder="U67190MH2010PTC123456" {...register('company_registration')} />
                </div>
                <div>
                  <label className="label mb-1">Country of Incorporation (ISO code)</label>
                  <input className="input-field" placeholder="IN" maxLength={2} {...register('company_country')} />
                </div>
              </div>
            )}
          </FormSection>

          <FormSection
            step={4}
            title="Identity Document"
            hint={isEditMode ? 'Optional for updates: upload new documents if details changed, or keep existing' : 'A government-issued photo ID'}
          >
            <div className="mb-4">
              <label className="label mb-1">Document Type</label>
              <select className="input-field" {...register('document_type')}>
                <option value="passport">Passport</option>
                <option value="national_id">National ID</option>
                <option value="drivers_license">Driver&apos;s License</option>
              </select>
              {errors.document_type && <p className="mt-1 text-xs text-danger">{errors.document_type.message}</p>}
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
              }}
              onDrop={handleDrop}
              className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
                dragActive ? 'border-accent bg-accent-soft' : 'border-line bg-surface-header hover:border-accent'
              }`}
            >
              <Upload className="h-8 w-8 text-muted" />
              <p className="mt-2 text-sm font-semibold text-ink">
                Drag and drop files here, or <span className="text-accent">browse</span>
              </p>
              <p className="stat-label mt-0.5">PDF, JPG or PNG, up to 10MB each</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>
            {pendingFiles.length > 0 && (
              <ul className="mt-4 space-y-2">
                {pendingFiles.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="tile flex items-center gap-3">
                    <FileText className="h-4 w-4 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{f.name}</p>
                      <p className="stat-label">{formatBytes(f.size)}</p>
                    </div>
                    <CheckCircle className="h-4 w-4 shrink-0 text-success" />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="btn-ghost shrink-0 p-1"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </FormSection>

          <FormSection step={5} title="Terms &amp; Conditions">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-line accent-accent" {...register('terms_agreed')} />
              <span className="text-sm text-ink">
                I agree to the{' '}
                <a href="/terms#kyc-aml" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                  ONCHAINID Terms &amp; Conditions
                </a>{' '}
                and consent to the creation of an on-chain identity contract for my wallet address. I confirm all information is accurate.
              </span>
            </label>
            {errors.terms_agreed && <p className="mt-2 text-xs text-danger">{errors.terms_agreed.message}</p>}
          </FormSection>

          <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="min-w-[14rem] flex-1 text-sm text-muted">
              {isEditMode
                ? 'Your updated profile information will be saved immediately.'
                : 'Your profile is submitted once and reused with every issuer on the platform.'}
            </p>
            <div className="flex items-center gap-3">
              {isEditMode && (
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="btn-secondary px-6"
                >
                  Cancel
                </button>
              )}
              <button type="submit" disabled={submitting} className="btn-primary px-8">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isEditMode ? 'Saving Changes…' : 'Submitting…'}
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" />
                    {isEditMode ? 'Save Changes' : 'Submit KYC Profile'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ── Profile exists — show qualification overview ──────────────────────────────

  // If token context, find the qualification for that issuer
  const issuerQual = token
    ? qualifications.find((q) => q.issuerId === token.createdBy)
    : null;

  const isKycRejected =
    profile.adminKycStatus === 'rejected' ||
    (qualifications.length > 0 && qualifications.every((q) => q.status === 'rejected')) ||
    qualifications.some((q) => q.status === 'rejected');

  const rejectionReason =
    profile.adminReason ||
    qualifications.find((q) => q.status === 'rejected' && q.rejectedReason)?.rejectedReason ||
    qualifications.find((q) => q.status === 'rejected' && q.reviewNotes)?.reviewNotes ||
    (isKycRejected ? 'Verification could not be approved based on the submitted details or documents.' : null);

  const isKycPending =
    !isKycRejected &&
    (profile.adminKycStatus === 'pending' ||
      qualifications.some((q) => q.status === 'pending' || q.status === 'under_review'));

  return (
    <div className="space-y-6">
      {tokenId && (
        <Link href={`/tokens/${tokenId}`} className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4" />
          Back to Token
        </Link>
      )}

      {/* KYC Rejection Notice Banner */}
      {isKycRejected && (
        <div className="card rounded-2xl border-2 border-danger/40 bg-danger-500/10 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="icon-chip bg-danger-100 text-danger shrink-0 mt-0.5">
                <XCircle className="h-6 w-6" />
              </span>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-danger">KYC Verification Rejected</h3>
                  <span className="badge-danger text-[11px]">Action Required</span>
                </div>
                <p className="text-xs text-muted">
                  Your identity verification was reviewed and rejected. Please see the rejection reason below, update your profile or documents, and re-submit for approval.
                </p>
                {rejectionReason && (
                  <div className="mt-3 rounded-xl border border-danger/25 bg-surface p-3.5 shadow-xs">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-danger">
                      Reason for Rejection:
                    </p>
                    <p className="mt-1 text-sm font-medium text-ink whitespace-pre-wrap">
                      {rejectionReason}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={startEditing}
              className="btn-primary bg-danger text-white hover:bg-danger/90 shrink-0 self-start"
            >
              <RefreshCw className="h-4 w-4" />
              Update Profile & Re-Submit
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="kicker mb-2">Identity</p>
          <h1 className="page-title">My KYC Identity</h1>
          <p className="mt-1 text-muted">One reusable ONCHAINID — qualifies you with multiple issuers</p>
        </div>
        <button
          type="button"
          onClick={startEditing}
          className="btn-secondary"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Update Profile
        </button>
      </div>

      {/* Profile card */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                'icon-chip',
                isKycRejected
                  ? 'bg-danger-100 text-danger'
                  : isKycPending
                  ? 'bg-warning-100 text-warning'
                  : 'bg-success-100 text-success'
              )}
            >
              {isKycRejected ? (
                <XCircle className="h-5 w-5" />
              ) : isKycPending ? (
                <Clock className="h-5 w-5" />
              ) : (
                <CheckCircle className="h-5 w-5" />
              )}
            </span>
            <div>
              <p className="font-semibold text-ink">{profile.fullName}</p>
              <p className="text-xs text-muted">
                {profile.investorType} · {profile.country} · Submitted {new Date(profile.submittedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          {isKycRejected ? (
            <span className="badge-danger">KYC Rejected</span>
          ) : isKycPending ? (
            <span className="badge-warning">Verification Pending</span>
          ) : (
            <span className="badge-success">Profile Active</span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 text-xs sm:grid-cols-4">
          <div>
            <p className="text-muted">Nationality</p>
            <p className="font-medium text-ink">{profile.nationality || '—'}</p>
          </div>
          <div>
            <p className="text-muted">City / Country</p>
            <p className="font-medium text-ink">{profile.city ? `${profile.city}, ${profile.country}` : profile.country || '—'}</p>
          </div>
          <div>
            <p className="text-muted">Date of Birth</p>
            <p className="font-medium text-ink">
              {profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : '—'}
            </p>
          </div>
          <div>
            <p className="text-muted">Phone</p>
            <p className="font-medium text-ink">{profile.extraData?.phone || '—'}</p>
          </div>
        </div>
      </div>

      {/* Token-specific CTA if we have context */}
      {token && (
        <div className="panel panel-highlight p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="icon-chip">
                <Coins className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-ink">
                  Investing in <strong>{token.name} ({token.symbol})</strong>
                </p>
                {issuerQual ? (
                  <p className="text-xs text-muted">
                    Your qualification status with this issuer is shown below.
                  </p>
                ) : (
                  <p className="text-xs text-muted">
                    Request qualification from this issuer to become eligible for their tokens.
                  </p>
                )}
              </div>
            </div>
            {!issuerQual && (
              <button
                onClick={() => handleRequestQualification(token.createdBy)}
                disabled={requestingQual}
                className="btn-primary shrink-0"
              >
                {requestingQual ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                Request Qualification
              </button>
            )}
          </div>
          {issuerQual && (
            <QualificationCard
              qual={issuerQual}
              className="mt-3"
              chainVerification={chainVerification}
              chainLoading={chainLoading}
              onRequestAgain={handleRequestQualification}
              onUpdateProfile={startEditing}
              requesting={requestingQual}
            />
          )}
        </div>
      )}

      {/* All qualifications */}
      <div>
        <h3 className="mb-3">Issuer Qualifications</h3>
        {qualifications.length === 0 ? (
          <div className="card p-8 text-center">
            <Shield className="mx-auto h-10 w-10 text-muted" />
            <p className="mt-3 font-medium text-ink">No qualification requests yet</p>
            <p className="mt-1 text-sm text-muted">
              Browse tokens and click &ldquo;Invest&rdquo; to request qualification from an issuer.
            </p>
            <Link href="/tokens" className="btn-primary mt-4 inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Browse Tokens
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {qualifications.map((qual) => (
              <QualificationCard
                key={qual.id}
                qual={qual}
                chainVerification={chainVerification}
                chainLoading={chainLoading}
                onRequestAgain={handleRequestQualification}
                onUpdateProfile={startEditing}
                requesting={requestingQual}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Numbered heading for one section of the KYC form. */
function FormSection({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-btn-text">
          {step}
        </span>
        <div className="min-w-0">
          <h3>{title}</h3>
          {hint && <p className="stat-label mt-0.5">{hint}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function pipelineLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: 'Identity pipeline queued…',
    processing: 'Deploying on-chain identity…',
    'step:deploy_onchainid': 'Deploying ONCHAINID contract…',
    'step:issue_claims': 'Issuing KYC claims on-chain…',
    'step:register_identity': 'Registering in token whitelist…',
    'step:verify_whitelist': 'Verifying on-chain whitelist…',
    'step:sync_db': 'Syncing database…',
    completed: 'Pipeline completed',
    failed: 'Pipeline failed — contact support',
    'deferred:no_wallet': 'Waiting for wallet address',
  };
  return labels[status] || status;
}

function ChainStatusRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {/* Icon + label: a passed step is never signalled by colour alone. */}
      {ok ? (
        <CheckCircle className="h-3.5 w-3.5 shrink-0 text-success" />
      ) : (
        <MinusCircle className="h-3.5 w-3.5 shrink-0 text-muted" />
      )}
      <span className={`truncate text-xs font-medium ${ok ? 'text-success' : 'text-muted'}`}>{label}</span>
      {detail && <span className="ml-auto shrink-0 text-xs text-muted">{detail}</span>}
    </div>
  );
}

// ── Qualification Card ────────────────────────────────────────────────────────

function QualificationCard({
  qual,
  className,
  chainVerification,
  chainLoading,
  onRequestAgain,
  onUpdateProfile,
  requesting,
}: {
  qual: Qualification;
  className?: string;
  chainVerification?: ChainVerification | null;
  chainLoading?: boolean;
  /** Re-submits a qualification request to the issuer that rejected it. */
  onRequestAgain?: (issuerId: string) => void;
  onUpdateProfile?: () => void;
  requesting?: boolean;
}) {
  const cfg = STATUS_CONFIG[qual.status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;

  const isInFlight = qual.blockchainStatus &&
    !['completed', 'failed', 'deferred:no_wallet'].includes(qual.blockchainStatus) &&
    qual.status === 'approved';

  return (
    <div className={clsx(`card border p-4 ${cfg.border}`, className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 shrink-0 ${cfg.color}`} />
          <div>
            <p className="text-sm font-medium text-ink">
              Issuer Qualification
            </p>
            <p className="text-xs text-muted">
              Requested {new Date(qual.createdAt).toLocaleDateString()}
              {qual.approvedAt && ` · Approved ${new Date(qual.approvedAt).toLocaleDateString()}`}
              {qual.expiresAt && ` · Expires ${new Date(qual.expiresAt).toLocaleDateString()}`}
            </p>
          </div>
        </div>
        <span className={cfg.badge}>
          {cfg.label}
        </span>
      </div>

      {qual.status === 'approved' && (
        <div className="mt-3 space-y-2">
          {/* Pipeline in-flight progress */}
          {isInFlight && (
            <div className="flex items-center gap-2 text-xs text-accent">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {pipelineLabel(qual.blockchainStatus!)}
            </div>
          )}

          {qual.blockchainStatus === 'deferred:no_wallet' && (
            <div className="panel flex items-center gap-2 border-warning bg-warning-100 px-3 py-2 text-xs text-warning">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Identity deployment is waiting for your wallet address. Link a wallet above.
            </div>
          )}

          {qual.blockchainStatus === 'failed' && qual.blockchainError && (
            <div className="panel flex items-center gap-2 border-danger bg-danger-100 px-3 py-2 text-xs text-danger">
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              Pipeline error: {qual.blockchainError}
            </div>
          )}

          {/* Real on-chain verification status */}
          {chainLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Verifying on-chain identity…
            </div>
          ) : chainVerification ? (
            <div className="panel bg-surface-header p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="label">On-Chain Identity</p>
                {chainVerification.identity_address && (
                  <span className="font-mono text-xs text-muted">
                    {chainVerification.identity_address.slice(0, 6)}…{chainVerification.identity_address.slice(-4)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <ChainStatusRow
                  ok={chainVerification.contract_deployed}
                  label="ONCHAINID Deployed"
                />
                <ChainStatusRow
                  ok={chainVerification.claims.length > 0 && chainVerification.claims.every(c => c.exists_on_chain && c.signature_valid && c.issuer_trusted)}
                  label="KYC Claims Valid"
                  detail={`${chainVerification.claims.filter(c => c.exists_on_chain).length}/${chainVerification.claims.length} claims`}
                />
                <ChainStatusRow
                  ok={chainVerification.token_whitelist_status.some(t => t.is_verified)}
                  label="Whitelisted"
                  detail={`${chainVerification.token_whitelist_status.filter(t => t.is_verified).length}/${chainVerification.token_whitelist_status.length} tokens`}
                />
                <ChainStatusRow
                  ok={chainVerification.fully_verified}
                  label="Eligible to Buy"
                />
              </div>
            </div>
          ) : !isInFlight && qual.blockchainStatus !== 'deferred:no_wallet' && (
            <p className="text-xs text-muted">
              Link a wallet to trigger on-chain identity deployment.
            </p>
          )}

          {chainVerification?.contract_deployed &&
            !chainVerification.fully_verified &&
            qual.blockchainStatus !== 'failed' && (
            <div className="panel bg-accent-soft px-3 py-2 text-xs text-accent">
              No wallet action is required. The issuer/platform pipeline is issuing claims and registering your wallet on-chain.
            </div>
          )}
        </div>
      )}

      {qual.status === 'rejected' && (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-danger/30 bg-danger-500/10 p-3.5 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-danger">
              <XCircle className="h-4 w-4 shrink-0" />
              <span>Rejection Reason:</span>
            </div>
            <p className="mt-1 font-medium text-ink whitespace-pre-wrap">
              {qual.rejectedReason || qual.reviewNotes || 'Verification could not be approved based on the submitted documents.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onUpdateProfile && (
              <button
                type="button"
                className="btn-primary bg-danger text-white hover:bg-danger/90 px-3 py-1.5 text-xs"
                onClick={onUpdateProfile}
              >
                <RefreshCw className="h-3 w-3" />
                Update Profile Details
              </button>
            )}
            {onRequestAgain && (
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-xs"
                onClick={() => onRequestAgain(qual.issuerId)}
                disabled={requesting}
              >
                {requesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
                Request re-qualification
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page Wrapper ──────────────────────────────────────────────────────────────

export default function KycPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      }
    >
      <KycPageContent />
    </Suspense>
  );
}
