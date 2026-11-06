'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/BrandMark';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Building2,
  ArrowLeft,
  CheckCircle,
  Loader2,
  AlertCircle,
  UploadCloud,
  FileText,
  X,
  MapPin,
  UserCheck,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { getMediaUrl } from '@/lib/media';

const COMPANY_TYPES = [
  'Asset Manager',
  'Real Estate Developer',
  'Private Equity Firm',
  'Venture Capital',
  'Family Office',
  'Bank / Financial Institution',
  'Startup / SME',
  'Fund Manager',
  'SPV / Holding Company',
  'Government Entity',
  'Other',
];

const COUNTRIES = [
  'India',
  'United States',
  'United Kingdom',
  'Singapore',
  'UAE',
  'Germany',
  'France',
  'Switzerland',
  'Australia',
  'Canada',
  'Netherlands',
  'Japan',
  'Hong Kong',
  'Mauritius',
  'Cayman Islands',
  'Other',
];

const IDENTITY_DOCUMENT_TYPES = [
  'Passport',
  'National Identity Card',
  'Driver\'s License',
  'Permanent Account Number (PAN)',
  'Aadhaar Card',
  'Tax Identification Number (TIN)',
  'Other Government Issued ID',
];

const COMMON_NATIONALITIES = [
  'Indian',
  'American',
  'British',
  'Singaporean',
  'Emirati',
  'German',
  'French',
  'Swiss',
  'Australian',
  'Canadian',
  'Dutch',
  'Other',
];

const schema = z
  .object({
    // 1. Company Information
    company_name: z.string().min(2, 'Company name is required').max(255),
    company_type: z.string().min(1, 'Please select a company type'),
    website: z.string().url('Enter a valid URL (e.g. https://example.com)').optional().or(z.literal('')),

    // 2. Registered Office & Operating Address
    registered_address: z.string().min(3, 'Registered office address is required').max(500),
    address_line_2: z.string().max(500).optional(),
    city: z.string().min(1, 'City is required').max(100),
    state_province: z.string().min(1, 'State / Province is required').max(100),
    postal_code: z.string().min(1, 'Postal Code is required').max(50),
    country: z.string().min(1, 'Please select a country'),
    is_operating_address_same: z.boolean(),
    operating_address: z.string().max(1000).optional(),

    // 3. Authorized Representative
    full_name: z.string().min(2, 'Full legal name is required').max(200),
    job_title: z.string().min(1, 'Designation / Job title is required').max(255),
    email: z.string().email('Valid business email address required'),
    phone_number: z.string().min(4, 'Valid phone number is required').max(50),
    nationality: z.string().min(1, 'Please select or enter nationality').max(100),
    identity_document_type: z.string().min(1, 'Please select document type'),
    identity_document_number: z.string().min(1, 'Identity document number is required').max(100),

    // 4. Use Case
    comments: z.string().max(2000).optional(),
    privacy: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the privacy policy & terms' }),
    }),
  })
  .refine(
    (data) => {
      if (!data.is_operating_address_same && (!data.operating_address || !data.operating_address.trim())) {
        return false;
      }
      return true;
    },
    {
      message: 'Business operating address is required when different from registered address',
      path: ['operating_address'],
    }
  );

type FormData = z.infer<typeof schema>;

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

interface UploadedDoc {
  url: string;
  fileName: string;
}

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors';
const labelClass = 'mb-1.5 block text-sm font-medium text-slate-300';

export default function ContactPage() {
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const router = useRouter();
  const { user } = useAuthStore();

  // Document upload state
  const [proofDoc, setProofDoc] = useState<UploadedDoc | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofError, setProofError] = useState('');

  const [authLetterDoc, setAuthLetterDoc] = useState<UploadedDoc | null>(null);
  const [authLetterUploading, setAuthLetterUploading] = useState(false);
  const [authLetterError, setAuthLetterError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      is_operating_address_same: true,
      operating_address: '',
    },
  });

  const isOperatingAddressSame = watch('is_operating_address_same');

  // Prefill from the account and check whether an application already exists.
  useEffect(() => {
    if (!user) return;
    let active = true;
    setValue('email', user.email);
    if (user.name) setValue('full_name', user.name);
    const check = async () => {
      try {
        const lead = await api.get('/issuer-leads/me');
        if (!active) return;
        if (lead.data?.data?.status && lead.data.data.status !== 'not_submitted' && lead.data.data.status !== 'rejected') {
          router.replace('/issuer/dashboard');
          return;
        }
      } catch {
        if (active) setErrorMsg('Could not check your issuer verification status. Please refresh the page.');
      }
    };
    check();
    return () => { active = false; };
  }, [user, setValue, router]);

  const handleFileUpload = async (file: File, docType: 'proof' | 'authLetter') => {
    const formData = new FormData();
    formData.append('file', file);

    if (docType === 'proof') {
      setProofUploading(true);
      setProofError('');
    } else {
      setAuthLetterUploading(true);
      setAuthLetterError('');
    }

    try {
      const res = await api.post('/issuer-leads/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.success && res.data?.data) {
        if (docType === 'proof') {
          setProofDoc(res.data.data);
        } else {
          setAuthLetterDoc(res.data.data);
        }
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const msg = axiosErr.response?.data?.message || 'File upload failed. Allowed formats: PDF, PNG, JPG, WEBP, DOCX up to 15MB.';
      if (docType === 'proof') {
        setProofError(msg);
      } else {
        setAuthLetterError(msg);
      }
    } finally {
      if (docType === 'proof') setProofUploading(false);
      else setAuthLetterUploading(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setSubmitState('loading');
    setErrorMsg('');

    try {
      const { privacy: _privacy, full_name, ...rest } = data;
      const parts = full_name.trim().split(/\s+/);
      const firstName = parts[0] || 'Issuer';
      const lastName = parts.slice(1).join(' ') || firstName;

      const payload = {
        ...rest,
        full_name,
        first_name: firstName,
        last_name: lastName,
        authorized_representative_name: full_name,
        proof_of_identity_url: proofDoc?.url ?? null,
        proof_of_identity_name: proofDoc?.fileName ?? null,
        authorization_letter_url: authLetterDoc?.url ?? null,
        authorization_letter_name: authLetterDoc?.fileName ?? null,
      };

      const res = await api.post('/issuer-leads', payload);
      setSubmissionId(res.data?.data?.id ?? null);
      setSubmitState('success');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setErrorMsg(
        axiosErr.response?.data?.message ||
        'Failed to submit application. Please verify all details and try again.',
      );
      setSubmitState('error');
    }
  };

  if (submitState === 'success') {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-surface">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />

        <nav className="relative border-b border-slate-800 bg-slate-950/95 px-6 py-4">
          <Link href="/issuer" className="inline-flex items-center gap-2">
            <BrandMark size={32} />
            <span className="font-bold text-ink">Assetro</span>
          </Link>
        </nav>

        <div className="relative flex flex-1 items-center justify-center px-6 py-20">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center shadow-2xl">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle className="h-10 w-10 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-ink">Application Submitted!</h2>
            <p className="mt-3 text-slate-400">
              Your institutional issuer application has been received with all corporate address and authorized representative details.
              Our compliance team will review your application within 1–2 business days.
            </p>
            {submissionId && (
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-800/60 px-4 py-3 text-left">
                <p className="text-xs text-slate-500 font-medium">Application Reference ID</p>
                <p className="mt-0.5 break-all font-mono text-sm text-cyan-400">{submissionId}</p>
              </div>
            )}
            <div className="mt-6 space-y-2 text-sm text-slate-400">
              <p className="font-semibold text-slate-300">Next Steps:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-left text-xs sm:text-sm text-slate-400">
                <li>Compliance team validates corporate registration &amp; representative ID</li>
                <li>Tenant workspace is provisioned upon verification</li>
                <li>Track the admin approval status on your issuer dashboard</li>
              </ol>
            </div>
            <Link
              href="/issuer/dashboard"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:-translate-y-0.5"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-surface">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />

      {/* Header */}
      <nav className="relative border-b border-slate-800 bg-slate-950/95 px-4 py-4 sm:px-6 lg:px-10 xl:px-16">
        <div className="flex w-full items-center justify-between gap-3">
          <Link href="/issuer" className="inline-flex items-center gap-2">
            <BrandMark size={32} />
            <span className="text-lg font-bold text-ink">Assetro</span>
          </Link>
          <Link
            href="/issuer/login"
            className="text-sm text-slate-400 hover:text-ink transition-colors"
          >
            <span className="hidden sm:inline">Already have an account? </span>Sign In
          </Link>
        </div>
      </nav>

      <div className="relative mx-auto max-w-4xl px-6 py-16">
        {/* Page header */}
        <div className="mb-10">
          <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </Link>
          <h1 className="text-4xl font-bold text-ink">Apply as an Issuer</h1>
          <p className="mt-3 text-lg text-slate-400">
            Complete the form below to apply for institutional asset tokenization access.
            All fields marked with <span className="text-red-400">*</span> are required.
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            This is an issuer application form, not a regular sign-up. Your tenant workspace will be provisioned once an admin approves your application.
          </div>
        </div>

        {/* Error banner */}
        {submitState === 'error' && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Section 1: Company Information */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <Building2 className="h-4 w-4" />
              </div>
              <h2 className="text-lg font-semibold text-ink">1. Company Information</h2>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  Company Legal Name <span className="text-red-400">*</span>
                </label>
                <input
                  {...register('company_name')}
                  placeholder="e.g. Acme Capital Partners Ltd."
                  className={inputClass}
                />
                {errors.company_name && (
                  <p className="mt-1 text-xs text-red-400">{errors.company_name.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  Company Type <span className="text-red-400">*</span>
                </label>
                <select
                  {...register('company_type')}
                  className={`${inputClass} [color-scheme:dark]`}
                >
                  <option value="">Select type...</option>
                  {COMPANY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {errors.company_type && (
                  <p className="mt-1 text-xs text-red-400">{errors.company_type.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  Company Website
                </label>
                <input
                  {...register('website')}
                  placeholder="https://yourcompany.com"
                  className={inputClass}
                />
                {errors.website && (
                  <p className="mt-1 text-xs text-red-400">{errors.website.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Registered Office & Operating Address */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                <MapPin className="h-4 w-4" />
              </div>
              <h2 className="text-lg font-semibold text-ink">2. Registered Office &amp; Operating Address</h2>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  Registered Office Address <span className="text-red-400">*</span>
                </label>
                <input
                  {...register('registered_address')}
                  placeholder="Street address, building name, suite number"
                  className={inputClass}
                />
                {errors.registered_address && (
                  <p className="mt-1 text-xs text-red-400">{errors.registered_address.message}</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>
                  Address Line 2
                </label>
                <input
                  {...register('address_line_2')}
                  placeholder="Floor, apartment, unit, or landmark (optional)"
                  className={inputClass}
                />
                {errors.address_line_2 && (
                  <p className="mt-1 text-xs text-red-400">{errors.address_line_2.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  City <span className="text-red-400">*</span>
                </label>
                <input
                  {...register('city')}
                  placeholder="e.g. Mumbai, London, New York"
                  className={inputClass}
                />
                {errors.city && (
                  <p className="mt-1 text-xs text-red-400">{errors.city.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  State / Province <span className="text-red-400">*</span>
                </label>
                <input
                  {...register('state_province')}
                  placeholder="e.g. Maharashtra, NY, England"
                  className={inputClass}
                />
                {errors.state_province && (
                  <p className="mt-1 text-xs text-red-400">{errors.state_province.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  Postal Code <span className="text-red-400">*</span>
                </label>
                <input
                  {...register('postal_code')}
                  placeholder="e.g. 400001, 10001"
                  className={inputClass}
                />
                {errors.postal_code && (
                  <p className="mt-1 text-xs text-red-400">{errors.postal_code.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  Country <span className="text-red-400">*</span>
                </label>
                <select
                  {...register('country')}
                  className={`${inputClass} [color-scheme:dark]`}
                >
                  <option value="">Select country...</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {errors.country && (
                  <p className="mt-1 text-xs text-red-400">{errors.country.message}</p>
                )}
              </div>

              {/* Operating address same question */}
              <div className="sm:col-span-2 pt-2 border-t border-slate-800">
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Is the operating address the same as the registered address? <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="is_operating_address_same_radio"
                      checked={isOperatingAddressSame === true}
                      onChange={() => setValue('is_operating_address_same', true, { shouldValidate: true })}
                      className="h-4 w-4 text-accent border-slate-700 bg-slate-800 focus:ring-accent"
                    />
                    <span className="text-sm font-medium text-slate-200">Yes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="is_operating_address_same_radio"
                      checked={isOperatingAddressSame === false}
                      onChange={() => setValue('is_operating_address_same', false, { shouldValidate: true })}
                      className="h-4 w-4 text-accent border-slate-700 bg-slate-800 focus:ring-accent"
                    />
                    <span className="text-sm font-medium text-slate-200">No</span>
                  </label>
                </div>
              </div>

              {/* Business Operating Address if different */}
              {!isOperatingAddressSame && (
                <div className="sm:col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 transition-all">
                  <label className={labelClass}>
                    Business Operating Address <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    {...register('operating_address')}
                    rows={3}
                    placeholder="Enter complete principal operating address, city, state, postal code, and country"
                    className={`${inputClass} resize-none`}
                  />
                  {errors.operating_address && (
                    <p className="mt-1 text-xs text-red-400">{errors.operating_address.message}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Authorized Representative */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <UserCheck className="h-4 w-4" />
              </div>
              <h2 className="text-lg font-semibold text-ink">3. Authorized Representative</h2>
            </div>
            <p className="mb-6 text-sm text-slate-400">
              Information about the person authorized to represent the issuer on the platform.
            </p>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  {...register('full_name')}
                  placeholder="e.g. Rajesh Sharma"
                  className={inputClass}
                />
                {errors.full_name && (
                  <p className="mt-1 text-xs text-red-400">{errors.full_name.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  Designation / Job Title <span className="text-red-400">*</span>
                </label>
                <input
                  {...register('job_title')}
                  placeholder="e.g. Managing Director / CEO / Director"
                  className={inputClass}
                />
                {errors.job_title && (
                  <p className="mt-1 text-xs text-red-400">{errors.job_title.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  Business Email <span className="text-red-400">*</span>
                </label>
                <input
                  {...register('email')}
                  type="email"
                  readOnly
                  placeholder="representative@company.com"
                  className={`${inputClass} cursor-not-allowed opacity-70`}
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  Phone Number <span className="text-red-400">*</span>
                </label>
                <input
                  {...register('phone_number')}
                  placeholder="+91 98765 43210"
                  className={inputClass}
                />
                {errors.phone_number && (
                  <p className="mt-1 text-xs text-red-400">{errors.phone_number.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  Nationality <span className="text-red-400">*</span>
                </label>
                <select
                  {...register('nationality')}
                  className={`${inputClass} [color-scheme:dark]`}
                >
                  <option value="">Select nationality...</option>
                  {COMMON_NATIONALITIES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                {errors.nationality && (
                  <p className="mt-1 text-xs text-red-400">{errors.nationality.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  Identity Document Type <span className="text-red-400">*</span>
                </label>
                <select
                  {...register('identity_document_type')}
                  className={`${inputClass} [color-scheme:dark]`}
                >
                  <option value="">Select document type...</option>
                  {IDENTITY_DOCUMENT_TYPES.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {errors.identity_document_type && (
                  <p className="mt-1 text-xs text-red-400">{errors.identity_document_type.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  Identity Document Number <span className="text-red-400">*</span>
                </label>
                <input
                  {...register('identity_document_number')}
                  placeholder="e.g. Passport number / ID card number"
                  className={inputClass}
                />
                {errors.identity_document_number && (
                  <p className="mt-1 text-xs text-red-400">{errors.identity_document_number.message}</p>
                )}
              </div>

              {/* Proof of Identity upload */}
              <div>
                <label className={labelClass}>
                  Proof of Identity
                </label>
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/40 p-4 transition-colors hover:border-slate-600">
                  {proofDoc ? (
                    <div className="flex items-center justify-between rounded-lg bg-slate-800/80 px-3 py-2.5">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <CheckCircle className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                        <span className="truncate text-xs font-medium text-slate-200">{proofDoc.fileName}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        <a
                          href={getMediaUrl(proofDoc.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded p-1 text-slate-400 hover:text-cyan-400"
                          title="View document"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => setProofDoc(null)}
                          className="rounded p-1 text-slate-400 hover:text-red-400"
                          title="Remove file"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 py-2 text-center">
                      <UploadCloud className="h-6 w-6 text-slate-400" />
                      <span className="text-xs font-medium text-slate-300">
                        {proofUploading ? 'Uploading proof...' : 'Click to upload Proof of Identity'}
                      </span>
                      <span className="text-[11px] text-slate-500">Passport, National ID (PDF, PNG, JPG ≤ 15MB)</span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        disabled={proofUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, 'proof');
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                  {proofUploading && (
                    <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-cyan-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Uploading document...
                    </div>
                  )}
                  {proofError && <p className="mt-2 text-xs text-red-400">{proofError}</p>}
                </div>
              </div>

              {/* Authorization Letter upload */}
              <div>
                <label className={labelClass}>
                  Authorization Letter / Board Resolution
                </label>
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/40 p-4 transition-colors hover:border-slate-600">
                  {authLetterDoc ? (
                    <div className="flex items-center justify-between rounded-lg bg-slate-800/80 px-3 py-2.5">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <CheckCircle className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                        <span className="truncate text-xs font-medium text-slate-200">{authLetterDoc.fileName}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        <a
                          href={getMediaUrl(authLetterDoc.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded p-1 text-slate-400 hover:text-cyan-400"
                          title="View document"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => setAuthLetterDoc(null)}
                          className="rounded p-1 text-slate-400 hover:text-red-400"
                          title="Remove file"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 py-2 text-center">
                      <FileText className="h-6 w-6 text-slate-400" />
                      <span className="text-xs font-medium text-slate-300">
                        {authLetterUploading ? 'Uploading letter...' : 'Click to upload Authorization / Resolution'}
                      </span>
                      <span className="text-[11px] text-slate-500">Board Resolution or POA (PDF, DOCX ≤ 15MB)</span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                        disabled={authLetterUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, 'authLetter');
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                  {authLetterUploading && (
                    <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-cyan-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Uploading document...
                    </div>
                  )}
                  {authLetterError && <p className="mt-2 text-xs text-red-400">{authLetterError}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Your Use Case */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <h2 className="text-lg font-semibold text-ink">4. Tokenization Project &amp; Use Case</h2>
            </div>
            <div>
              <label className={labelClass}>
                Comments / What would you like to tokenize?
              </label>
              <textarea
                {...register('comments')}
                rows={4}
                placeholder="Describe your planned tokenization project: asset class, expected capital raise, investor profile, target jurisdiction, timeline, etc."
                className={`${inputClass} resize-none`}
              />
              {errors.comments && (
                <p className="mt-1 text-xs text-red-400">{errors.comments.message}</p>
              )}
            </div>
          </div>

          {/* Privacy + Submit */}
          <div className="space-y-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                {...register('privacy')}
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
              />
              <span className="text-sm text-slate-400">
                I agree to the{' '}
                <Link
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 hover:underline"
                >
                  Privacy Policy
                </Link>
                {' '}and{' '}
                <Link
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 hover:underline"
                >
                  Terms of Service
                </Link>.
                I confirm that I am an authorized representative of the entity and that all submitted corporate information and identity credentials are true and accurate.
                <span className="text-red-400"> *</span>
              </span>
            </label>
            {errors.privacy && (
              <p className="text-xs text-red-400">{errors.privacy.message}</p>
            )}

            <button
              type="submit"
              disabled={submitState === 'loading' || proofUploading || authLetterUploading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-4 text-base font-semibold text-slate-950 shadow-lg transition-all hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60"
            >
              {submitState === 'loading' ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Submitting Application...
                </>
              ) : (
                'Submit Issuer Application'
              )}
            </button>

            <p className="text-center text-xs text-slate-500">
              Applications are reviewed within 1–2 business days. On approval, compliance team provisions your secure tenant terminal.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
