'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Coins,
  Shield,
  Globe,
  Eye,
  Loader2,
  ImagePlus,
  X,
  Wallet,
  AlertTriangle,
  RefreshCw,
  Copy,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAccount, useBalance, useConnect, useDisconnect } from 'wagmi';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { getTREXGatewayAddress } from '@/lib/contracts/config';
import { parseBaseError } from '@/lib/contracts/evm';

const steps = [
  { id: 1, label: 'Basic Info', icon: FileText },
  { id: 2, label: 'Supply & Distribution', icon: Coins },
  { id: 3, label: 'Compliance Rules', icon: Shield },
  { id: 4, label: 'Blockchain', icon: Globe },
  { id: 5, label: 'Review & Deploy', icon: Eye },
];

const chainIdMap: Record<string, number> = {
  'arc-testnet': 5042002,
  ethereum: 1,
  sepolia: 11155111,
  polygon: 137,
  bharat: 8272,
};

const chainOptions = [
  {
    id: 'arc-testnet',
    name: 'Arc Testnet',
    desc: 'USDC gas · Arc Testnet',
  },
  {
    id: 'sepolia',
    name: 'Ethereum Sepolia',
    desc: 'Requires a Sepolia gateway address',
  },
  {
    id: 'ethereum',
    name: 'Ethereum',
    desc: 'Requires a mainnet gateway address',
  },
  {
    id: 'polygon',
    name: 'Polygon',
    desc: 'Requires a Polygon gateway address',
  },
  {
    id: 'bharat',
    name: 'Bharat Chain',
    desc: 'Requires a Bharat gateway address',
  },
] as const;

function getInitialBlockchain(): string {
  const defaultChainId = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || '11155111');
  const preferred = chainOptions.find(
    (chain) => chainIdMap[chain.id] === defaultChainId && getTREXGatewayAddress(defaultChainId),
  );
  return preferred?.id ||
    chainOptions.find((chain) => getTREXGatewayAddress(chainIdMap[chain.id]))?.id ||
    '';
}

function normalizeTotalSupply(value: string): string | null {
  const input = value.trim().replace(/,/g, '');
  const parts = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(input);
  if (!parts) return null;

  const exponent = Number(parts[3] || 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 78) return null;

  let digits = parts[1] + (parts[2] || '');
  const decimalPlaces = (parts[2]?.length || 0) - exponent;
  if (decimalPlaces > 0) {
    if (decimalPlaces >= digits.length || !/^0+$/.test(digits.slice(-decimalPlaces))) {
      return null;
    }
    digits = digits.slice(0, -decimalPlaces);
  } else if (decimalPlaces < 0) {
    digits += '0'.repeat(-decimalPlaces);
  }

  const normalized = digits.replace(/^0+/, '');
  return normalized && normalized.length <= 78 ? normalized : null;
}

interface ComplianceModulesFormData {
  countryRestrict: {
    enabled: boolean;
    restrictedCountries: string[]; // ISO 3166-1 numeric codes as strings, e.g. "840"
  };
  maxHolders: {
    enabled: boolean;
    max: string;
  };
  transferWindow: {
    enabled: boolean;
  };
  supplyLimit: {
    enabled: boolean;
    limit: string; // max total supply (tokens)
  };
  maxBalance: {
    enabled: boolean;
    max: string; // max tokens per wallet
  };
  dayMonthLimits: {
    enabled: boolean;
    dailyLimit: string;
    monthlyLimit: string;
  };
  exchangeMonthlyLimits: {
    enabled: boolean;
    exchangeAddresses: string; // newline-separated wallet addresses
    monthlyLimit: string;
  };
}

interface TokenFormData {
  name: string;
  symbol: string;
  description: string;
  assetType: string;
  totalSupply: string;
  initialPrice: string;
  minInvestment: string;
  maxInvestment: string;
  distributionMethod: string;
  kycRequired: boolean;
  accreditedOnly: boolean;
  geoRestrictions: string[];
  maxHolders: string;
  transferRestrictions: boolean;
  blockchain: string;
  standard: string;
  logoUrl: string;
  nanocDocUrl: string;
  nanocDocName: string;
  propertyPlanDocUrl: string;
  propertyPlanDocName: string;
  complianceModules: ComplianceModulesFormData;
}

interface ComplianceRuleInput {
  rule_type: string;
  parameters: Record<string, unknown>;
}

export default function CreateTokenPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  const [currentStep, setCurrentStep] = useState(1);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [createdTokenId, setCreatedTokenId] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleSwitchAccount = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).ethereum?.request) {
        await (window as any).ethereum.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        });
      } else {
        disconnect();
      }
    } catch {
      // User dismissed dialog
    }
  };

  const handleConnectWallet = () => {
    const metaMaskConnector =
      connectors.find((c) => c.name.toLowerCase().includes('metamask')) ||
      connectors[0];
    if (metaMaskConnector) {
      connect({ connector: metaMaskConnector });
    }
  };
  const [formData, setFormData] = useState<TokenFormData>({
    name: '',
    symbol: '',
    description: '',
    assetType: '',
    totalSupply: '',
    initialPrice: '',
    minInvestment: '',
    maxInvestment: '',
    distributionMethod: 'fixed price',
    kycRequired: true,
    accreditedOnly: false,
    geoRestrictions: [],
    maxHolders: '',
    transferRestrictions: true,
    blockchain: getInitialBlockchain(),
    standard: 'ERC-3643',
    logoUrl: '',
    nanocDocUrl: '',
    nanocDocName: '',
    propertyPlanDocUrl: '',
    propertyPlanDocName: '',
    complianceModules: {
      countryRestrict: { enabled: false, restrictedCountries: [] },
      maxHolders: { enabled: false, max: '' },
      transferWindow: { enabled: false },
      supplyLimit: { enabled: false, limit: '' },
      maxBalance: { enabled: false, max: '' },
      dayMonthLimits: { enabled: false, dailyLimit: '', monthlyLimit: '' },
      exchangeMonthlyLimits: { enabled: false, exchangeAddresses: '', monthlyLimit: '' },
    },
  });

  const updateField = (field: keyof TokenFormData, value: string | boolean | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setLogoError('Only PNG, JPG, SVG, WebP or GIF images are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError('Image must be smaller than 5 MB.');
      return;
    }

    setLogoError(null);
    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = ev => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Upload to API
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const userId = useAuthStore.getState().user?.id;
      const res = await api.post('/tokens/upload-logo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(userId ? { 'x-user-id': userId } : {}),
        },
      });
      const url = res.data?.data?.url;
      if (url) updateField('logoUrl', url);
    } catch {
      setLogoError('Upload failed. The preview is shown but the URL will not be saved.');
    } finally {
      setLogoUploading(false);
    }
  };

  const [docUploading, setDocUploading] = useState<Record<string, boolean>>({});
  const [docError, setDocError] = useState<Record<string, string | null>>({});

  const handleDocChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    urlField: 'nanocDocUrl' | 'propertyPlanDocUrl',
    nameField: 'nanocDocName' | 'propertyPlanDocName',
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
    ];
    if (!allowed.includes(file.type)) {
      setDocError((p) => ({ ...p, [urlField]: 'Only PDF, DOC, DOCX, PNG or JPG files are allowed.' }));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setDocError((p) => ({ ...p, [urlField]: 'File must be smaller than 10 MB.' }));
      return;
    }
    setDocError((p) => ({ ...p, [urlField]: null }));
    setDocUploading((p) => ({ ...p, [urlField]: true }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      const userId = useAuthStore.getState().user?.id;
      const res = await api.post('/tokens/upload-document', fd, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(userId ? { 'x-user-id': userId } : {}),
        },
      });
      const url = res.data?.data?.url;
      if (url) {
        updateField(urlField, url);
        updateField(nameField, file.name);
      }
    } catch {
      setDocError((p) => ({ ...p, [urlField]: 'Upload failed. Please try again.' }));
    } finally {
      setDocUploading((p) => ({ ...p, [urlField]: false }));
      e.target.value = '';
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setLogoError(null);
    updateField('logoUrl', '');
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const updateComplianceModule = (
    module: keyof ComplianceModulesFormData,
    patch: Partial<ComplianceModulesFormData[typeof module]>,
  ) => {
    setFormData((prev) => ({
      ...prev,
      complianceModules: {
        ...prev.complianceModules,
        [module]: { ...prev.complianceModules[module], ...patch },
      },
    }));
  };

  const toggleCountry = (code: string) => {
    const current = formData.complianceModules.countryRestrict.restrictedCountries;
    const updated = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    updateComplianceModule('countryRestrict', { restrictedCountries: updated });
  };

  const buildComplianceModulesPayload = () => {
    const m = formData.complianceModules;
    const hasAny =
      m.countryRestrict.enabled || m.maxHolders.enabled || m.transferWindow.enabled ||
      m.supplyLimit.enabled || m.maxBalance.enabled ||
      m.dayMonthLimits.enabled || m.exchangeMonthlyLimits.enabled;
    if (!hasAny) return undefined;

    return {
      ...(m.countryRestrict.enabled && {
        country_restrict: {
          enabled: true,
          restricted_countries: m.countryRestrict.restrictedCountries
            .map(Number)
            .filter((n) => !isNaN(n) && n > 0),
        },
      }),
      ...(m.maxHolders.enabled && m.maxHolders.max && {
        max_holders: { enabled: true, max: Number(m.maxHolders.max) },
      }),
      ...(m.transferWindow.enabled && {
        transfer_window: { enabled: true },
      }),
      ...(m.supplyLimit.enabled && m.supplyLimit.limit && {
        supply_limit: { enabled: true, limit: m.supplyLimit.limit },
      }),
      ...(m.maxBalance.enabled && m.maxBalance.max && {
        max_balance: { enabled: true, max: m.maxBalance.max },
      }),
      ...(m.dayMonthLimits.enabled && (m.dayMonthLimits.dailyLimit || m.dayMonthLimits.monthlyLimit) && {
        day_month_limits: {
          enabled: true,
          daily_limit: m.dayMonthLimits.dailyLimit || undefined,
          monthly_limit: m.dayMonthLimits.monthlyLimit || undefined,
        },
      }),
      ...(m.exchangeMonthlyLimits.enabled && m.exchangeMonthlyLimits.monthlyLimit && {
        exchange_monthly_limits: {
          enabled: true,
          exchange_addresses: m.exchangeMonthlyLimits.exchangeAddresses
            .split('\n').map(s => s.trim()).filter(Boolean),
          monthly_limit: m.exchangeMonthlyLimits.monthlyLimit,
        },
      }),
    };
  };

  // NOTE: the on-chain module arrays for deployTREXSuite are built from the
  // stored `metadata.compliance_modules` at deploy time — see
  // src/lib/complianceModules.ts, used by the token detail page.

  const validateForm = () => {
    if (!formData.name.trim()) {
      setCurrentStep(1);
      return 'Token name is required.';
    }
    if (!formData.symbol.trim()) {
      setCurrentStep(1);
      return 'Token symbol is required.';
    }
    if (!formData.nanocDocUrl) {
      setCurrentStep(1);
      return 'NANOC document is required.';
    }
    if (!formData.propertyPlanDocUrl) {
      setCurrentStep(1);
      return 'Property Plan document is required.';
    }
    if (!formData.assetType) {
      setCurrentStep(1);
      return 'Select an asset type.';
    }
    if (!normalizedTotalSupply) {
      setCurrentStep(2);
      return 'Total supply must be a whole number greater than 0.';
    }
    if (formData.minInvestment && formData.maxInvestment) {
      const min = Number(formData.minInvestment);
      const max = Number(formData.maxInvestment);
      if (min > 0 && max > 0 && min > max) {
        setCurrentStep(2);
        return `Minimum investment (${min}) cannot be greater than maximum investment (${max}).`;
      }
    }
    if (!formData.blockchain || !chainIdMap[formData.blockchain]) {
      setCurrentStep(4);
      return 'Select a blockchain network.';
    }
    if (!getTREXGatewayAddress(chainIdMap[formData.blockchain])) {
      setCurrentStep(4);
      return 'This network needs a configured TREX gateway address before token submission.';
    }

    return null;
  };

  const buildComplianceRules = (): ComplianceRuleInput[] => {
    const rules: ComplianceRuleInput[] = [];

    if (formData.maxHolders && Number(formData.maxHolders) > 0) {
      rules.push({
        rule_type: 'investor_limit',
        parameters: {
          max_investors: Number(formData.maxHolders),
        },
      });
    }

    if (formData.accreditedOnly) {
      rules.push({
        rule_type: 'investor_class',
        parameters: {
          allowed_investor_types: ['accredited', 'qualified', 'institutional'],
        },
      });
    }

    if (formData.geoRestrictions.length > 0) {
      rules.push({
        rule_type: 'country_restriction',
        parameters: {
          blocked_countries: formData.geoRestrictions,
        },
      });
    }

    return rules;
  };

  const targetChainId = formData.blockchain ? chainIdMap[formData.blockchain] : undefined;
  const normalizedTotalSupply = normalizeTotalSupply(formData.totalSupply);

  const handleDeploy = async () => {
    const validationError = validateForm();
    if (validationError) {
      toast.error(validationError);
      setDeployError(validationError);
      return;
    }

    let tokenId = createdTokenId;

    try {
      setDeploying(true);
      setDeployError(null);
      toast.loading('Submitting token for approval...', { id: 'submit-token' });

      const targetChain = (formData.blockchain && chainIdMap[formData.blockchain]) ||
        Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || '11155111');
      const user = useAuthStore.getState().user;
      const userId = user?.id;
      const headers = {
        ...(userId ? { 'x-user-id': userId } : {}),
      };
      const complianceRules = buildComplianceRules();

      if (!tokenId) {
        const complianceModulesPayload = buildComplianceModulesPayload();
        const walletAddress = address || user?.walletAddress || '0x0000000000000000000000000000000000000000';

        const response = await api.post(
          '/tokens',
          {
            name: formData.name.trim(),
            symbol: formData.symbol.trim().toUpperCase(),
            decimals: 18,
            total_supply: normalizedTotalSupply!,
            asset_type: formData.assetType,
            chain_id: targetChain,
            description: formData.description.trim(),
            compliance_rules: complianceRules,
            metadata: {
              ...(walletAddress && {
                deployer_address: walletAddress,
                owner_address: walletAddress,
              }),
              offering: {
                initial_price: formData.initialPrice ? Number(formData.initialPrice) : null,
                min_investment: formData.minInvestment ? Number(formData.minInvestment) : null,
                max_investment: formData.maxInvestment ? Number(formData.maxInvestment) : null,
                distribution_method: formData.distributionMethod,
                standard: formData.standard,
                blockchain: formData.blockchain,
              },
              compliance: {
                kyc_required: formData.kycRequired,
                accredited_only: formData.accreditedOnly,
                transfer_restrictions: formData.transferRestrictions,
                geo_restrictions: formData.geoRestrictions,
                max_holders: formData.maxHolders ? Number(formData.maxHolders) : null,
              },
              ...(complianceModulesPayload && { compliance_modules: complianceModulesPayload }),
              ...(formData.logoUrl && { logo: formData.logoUrl }),
              ...((formData.nanocDocUrl || formData.propertyPlanDocUrl) && {
                documents: {
                  ...(formData.nanocDocUrl && {
                    nanoc: { url: formData.nanocDocUrl, name: formData.nanocDocName },
                  }),
                  ...(formData.propertyPlanDocUrl && {
                    property_plan: { url: formData.propertyPlanDocUrl, name: formData.propertyPlanDocName },
                  }),
                },
              }),
            },
          },
          { headers }
        );

        tokenId = response.data?.data?.id;

        if (!tokenId) {
          throw new Error('Token was created, but no token id was returned by the API.');
        }

        setCreatedTokenId(tokenId);
      }

      toast.success('Token submitted for platform approval!', { id: 'submit-token' });
      router.push(`/issuer/tokens/${tokenId}?submitted=1`);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
            'Failed to create token'
          : err instanceof Error
          ? parseBaseError(err)
          : 'Failed to create token';

      toast.error(message, { id: 'submit-token' });
      setDeployError(message);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            onClick={() => router.push('/issuer/tokens')}
            className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tokens
          </button>
          <h1 className="mt-2 text-2xl font-bold text-ink">Create New Token</h1>
        </div>

        <button
          type="button"
          onClick={handleDeploy}
          disabled={deploying}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        >
          {deploying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting for approval...
            </>
          ) : (
            <>
              Submit for Approval
              <Check className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {/* Stepper */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;

            return (
              <div key={step.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => setCurrentStep(step.id)}
                  className="flex flex-col items-center group cursor-pointer focus:outline-none"
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-transform group-hover:scale-105 ${
                      isCompleted
                        ? 'bg-emerald-500 text-slate-950'
                        : isCurrent
                        ? 'bg-accent text-slate-950 shadow-lg'
                        : 'border-2 border-slate-700 text-slate-500 group-hover:border-slate-500'
                    }`}
                  >
                    {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <span
                    className={`mt-2 text-xs font-medium transition-colors ${
                      isCurrent ? 'text-accent font-semibold' : 'text-slate-500 group-hover:text-slate-300'
                    }`}
                  >
                    {step.label}
                  </span>
                </button>
                {index < steps.length - 1 && (
                  <div
                    className={`mx-4 h-0.5 w-16 lg:w-24 ${
                      isCompleted ? 'bg-emerald-500' : 'bg-slate-800'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        {currentStep === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-ink">Basic Information</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Token Name</label>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark]"
                  placeholder="e.g., Mumbai Commercial REIT"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Symbol</label>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark]"
                  placeholder="e.g., RELT-01"
                  value={formData.symbol}
                  onChange={(e) => updateField('symbol', e.target.value.toUpperCase())}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-300">Description</label>
                <textarea
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark] min-h-[100px]"
                  placeholder="Describe the underlying asset and investment opportunity..."
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Asset Type</label>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark]"
                  value={formData.assetType}
                  onChange={(e) => updateField('assetType', e.target.value)}
                >
                  <option value="">Select asset type</option>
                  <option value="real_estate">Real Estate</option>
                  <option value="commodity">Commodity</option>
                  <option value="bond">Bond</option>
                  <option value="equity">Equity</option>
                  <option value="art">Art & Collectibles</option>
                  <option value="infrastructure">Infrastructure</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">NANOC Document <span className="text-red-400">*</span></label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  disabled={!!docUploading.nanocDocUrl}
                  onChange={(e) => handleDocChange(e, 'nanocDocUrl', 'nanocDocName')}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-sm file:text-slate-200 disabled:opacity-50 [color-scheme:dark]"
                />
                <p className="mt-1 text-xs text-slate-500">PDF, DOC, DOCX, PNG or JPG · Max 10 MB</p>
                {docUploading.nanocDocUrl && <p className="mt-1 text-xs text-blue-400">Uploading…</p>}
                {formData.nanocDocUrl && !docUploading.nanocDocUrl && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-emerald-400">
                    <Check className="h-3.5 w-3.5" /> {formData.nanocDocName || 'Uploaded successfully'}
                  </p>
                )}
                {docError.nanocDocUrl && <p className="mt-1 text-xs text-red-400">{docError.nanocDocUrl}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Property Plan Document <span className="text-red-400">*</span></label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  disabled={!!docUploading.propertyPlanDocUrl}
                  onChange={(e) => handleDocChange(e, 'propertyPlanDocUrl', 'propertyPlanDocName')}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-sm file:text-slate-200 disabled:opacity-50 [color-scheme:dark]"
                />
                <p className="mt-1 text-xs text-slate-500">PDF, DOC, DOCX, PNG or JPG · Max 10 MB</p>
                {docUploading.propertyPlanDocUrl && <p className="mt-1 text-xs text-blue-400">Uploading…</p>}
                {formData.propertyPlanDocUrl && !docUploading.propertyPlanDocUrl && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-emerald-400">
                    <Check className="h-3.5 w-3.5" /> {formData.propertyPlanDocName || 'Uploaded successfully'}
                  </p>
                )}
                {docError.propertyPlanDocUrl && <p className="mt-1 text-xs text-red-400">{docError.propertyPlanDocUrl}</p>}
              </div>

              {/* Logo upload */}
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-300">Token Logo</label>
                <div className="flex items-start gap-4">
                  {/* Preview */}
                  <div className={`relative flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 ${
 logoPreview ? 'border-blue-500/30 bg-slate-800/60' : 'border-dashed border-slate-700 bg-slate-800/40' }`}>
                    {logoPreview ? (
                      <>
                        <img src={logoPreview} alt="Token logo preview" className="h-full w-full rounded-xl object-contain p-1" />
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="absolute -right-2 -top-2 rounded-full border border-slate-700 bg-slate-900 p-0.5 shadow text-slate-400 hover:text-red-400"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        {logoUploading && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900/70">
                            <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                          </div>
                        )}
                      </>
                    ) : (
                      <ImagePlus className="h-7 w-7 text-slate-600" />
                    )}
                  </div>

                  {/* Upload area */}
                  <div className="flex-1">
                    <input
                      ref={logoInputRef}
                      type="file"
                      className="hidden"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                      onChange={handleLogoChange}
                    />
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoUploading}
                      className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                    >
                      {logoUploading
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                        : <><ImagePlus className="h-4 w-4" /> {logoPreview ? 'Change Logo' : 'Upload Logo'}</>}
                    </button>
                    <p className="mt-1.5 text-xs text-slate-500">
                      PNG, JPG, SVG, WebP or GIF · Max 5 MB · Recommended 200×200 px
                    </p>
                    {formData.logoUrl && !logoUploading && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-emerald-400">
                        <Check className="h-3.5 w-3.5" /> Uploaded successfully
                      </p>
                    )}
                    {logoError && (
                      <p className="mt-1 text-xs text-red-400">{logoError}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-ink">Supply & Distribution</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Total Supply</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark]"
                  placeholder="e.g., 200000"
                  value={formData.totalSupply}
                  onChange={(e) => updateField('totalSupply', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Initial Price (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark]"
                  placeholder="e.g., 10.00"
                  value={formData.initialPrice}
                  onChange={(e) => updateField('initialPrice', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Minimum Investment (tokens)</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark]"
                  placeholder="e.g., 100"
                  value={formData.minInvestment}
                  onChange={(e) => updateField('minInvestment', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Maximum Investment (tokens)</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark]"
                  placeholder="e.g., 50000"
                  value={formData.maxInvestment}
                  onChange={(e) => updateField('maxInvestment', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Distribution Method</label>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark]"
                  value={formData.distributionMethod}
                  onChange={(e) => updateField('distributionMethod', e.target.value)}
                >
                  <option value="fixed price">Fixed Price</option>
                  <option value="auction">Auction</option>
                  <option value="private placement">Private Placement</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-ink">Compliance Rules</h3>
              <div className="space-y-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.kycRequired}
                    onChange={(e) => updateField('kycRequired', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-ink">KYC Required</p>
                    <p className="text-xs text-slate-400">Investors must complete identity verification</p>
                  </div>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.accreditedOnly}
                    onChange={(e) => updateField('accreditedOnly', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-ink">Accredited Investors Only</p>
                    <p className="text-xs text-slate-400">Restrict to accredited/qualified investors</p>
                  </div>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.transferRestrictions}
                    onChange={(e) => updateField('transferRestrictions', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-ink">Transfer Restrictions</p>
                    <p className="text-xs text-slate-400">Transfers require compliance check before execution</p>
                  </div>
                </label>
              </div>
            </div>

            {/* ── On-chain Compliance Modules ──────────────────────────────── */}
            <div className="space-y-4 border-t border-slate-800 pt-4">
              <div>
                <h3 className="text-lg font-semibold text-ink">Compliance Modules</h3>
                <p className="mt-1 text-xs text-slate-400">
                  These modules are deployed as shared on-chain singletons. When enabled they are
                  bound to your token&apos;s compliance contract at deployment time.
                </p>
              </div>

              {/* Country Restriction Module */}
              <div className="rounded-lg border border-slate-800 p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.complianceModules.countryRestrict.enabled}
                    onChange={(e) => updateComplianceModule('countryRestrict', { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-ink">Country Restrictions</p>
                    <p className="text-xs text-slate-400">Block investors from specific countries (ISO 3166-1 numeric codes)</p>
                  </div>
                </label>

                {formData.complianceModules.countryRestrict.enabled && (
                  <div className="mt-3 space-y-3 pl-7">
                    <p className="text-xs font-medium text-slate-300">Common country codes to restrict:</p>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                      {[
                        { code: '840', label: 'United States (840)' },
                        { code: '156', label: 'China (156)' },
                        { code: '643', label: 'Russia (643)' },
                        { code: '364', label: 'Iran (364)' },
                        { code: '408', label: 'North Korea (408)' },
                        { code: '862', label: 'Venezuela (862)' },
                      ].map(({ code, label }) => (
                        <label key={code} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={formData.complianceModules.countryRestrict.restrictedCountries.includes(code)}
                            onChange={() => toggleCountry(code)}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                          />
                          <span className="text-slate-300">{label}</span>
                        </label>
                      ))}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-300">Other (comma-separated codes, e.g. 276,380)</label>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark] max-w-xs text-sm"
                        placeholder="e.g. 276,380"
                        onBlur={(e) => {
                          const extra = e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter((s) => /^\d+$/.test(s));
                          const current = formData.complianceModules.countryRestrict.restrictedCountries;
                          const merged = Array.from(new Set([...current, ...extra]));
                          updateComplianceModule('countryRestrict', { restrictedCountries: merged });
                          e.target.value = '';
                        }}
                      />
                    </div>
                    {formData.complianceModules.countryRestrict.restrictedCountries.length > 0 && (
                      <p className="text-xs text-slate-400">
                        Restricted: {formData.complianceModules.countryRestrict.restrictedCountries.join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Max Holder Module */}
              <div className="rounded-lg border border-slate-800 p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.complianceModules.maxHolders.enabled}
                    onChange={(e) => updateComplianceModule('maxHolders', { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-ink">Maximum Holders</p>
                    <p className="text-xs text-slate-400">Enforce an on-chain cap on the number of distinct token holders</p>
                  </div>
                </label>

                {formData.complianceModules.maxHolders.enabled && (
                  <div className="mt-3 pl-7">
                    <label className="mb-1 block text-xs font-medium text-slate-300">Maximum number of token holders</label>
                    <input
                      type="number"
                      min="1"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark] max-w-xs text-sm"
                      placeholder="e.g. 500"
                      value={formData.complianceModules.maxHolders.max}
                      onChange={(e) => updateComplianceModule('maxHolders', { max: e.target.value })}
                    />
                  </div>
                )}
              </div>

              {/* Transfer Window (Blackout) Module */}
              <div className="rounded-lg border border-slate-800 p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.complianceModules.transferWindow.enabled}
                    onChange={(e) => updateComplianceModule('transferWindow', { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-ink">Transfer Window (Blackout)</p>
                    <p className="text-xs text-slate-400">
                      Allows setting scheduled blackout periods during which all transfers are blocked.
                      Blackout windows are configured after deployment from the token management page.
                    </p>
                  </div>
                </label>
              </div>

              {/* Supply Limit Module */}
              <div className="rounded-lg border border-teal-500/20 p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.complianceModules.supplyLimit.enabled}
                    onChange={(e) => updateComplianceModule('supplyLimit', { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-ink">Supply Limit</p>
                    <p className="text-xs text-slate-400">
                      Hard cap on total mintable supply. Blocks any mint that would push total supply above the limit.
                    </p>
                  </div>
                </label>
                {formData.complianceModules.supplyLimit.enabled && (
                  <div className="mt-3 pl-7">
                    <label className="mb-1 block text-xs font-medium text-slate-300">Maximum total supply (tokens)</label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark] max-w-xs text-sm"
                      placeholder="e.g. 1000000"
                      value={formData.complianceModules.supplyLimit.limit}
                      onChange={(e) => updateComplianceModule('supplyLimit', { limit: e.target.value })}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      On-chain: <code>SupplyLimitModule</code>
                    </p>
                  </div>
                )}
              </div>

              {/* Max Balance Module */}
              <div className="rounded-lg border border-indigo-500/20 p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.complianceModules.maxBalance.enabled}
                    onChange={(e) => updateComplianceModule('maxBalance', { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-ink">Max Balance per Wallet</p>
                    <p className="text-xs text-slate-400">
                      Caps how many tokens any single investor identity can hold across all their wallets.
                    </p>
                  </div>
                </label>
                {formData.complianceModules.maxBalance.enabled && (
                  <div className="mt-3 pl-7">
                    <label className="mb-1 block text-xs font-medium text-slate-300">Maximum balance per investor identity (tokens)</label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark] max-w-xs text-sm"
                      placeholder="e.g. 50000"
                      value={formData.complianceModules.maxBalance.max}
                      onChange={(e) => updateComplianceModule('maxBalance', { max: e.target.value })}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      On-chain: <code>MaxBalanceModule</code> — aggregates across all wallets of the same ONCHAINID
                    </p>
                  </div>
                )}
              </div>

              {/* Daily / Monthly Limits Module */}
              <div className="rounded-lg border border-orange-500/20 p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.complianceModules.dayMonthLimits.enabled}
                    onChange={(e) => updateComplianceModule('dayMonthLimits', { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-ink">Daily / Monthly Transfer Limits</p>
                    <p className="text-xs text-slate-400">
                      Limits how many tokens each investor can send per day and per month (rolling windows).
                    </p>
                  </div>
                </label>
                {formData.complianceModules.dayMonthLimits.enabled && (
                  <div className="mt-3 grid grid-cols-2 gap-3 pl-7">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-300">Daily limit (tokens)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark] text-sm"
                        placeholder="Leave blank to skip"
                        value={formData.complianceModules.dayMonthLimits.dailyLimit}
                        onChange={(e) => updateComplianceModule('dayMonthLimits', { dailyLimit: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-300">Monthly limit (tokens)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark] text-sm"
                        placeholder="Leave blank to skip"
                        value={formData.complianceModules.dayMonthLimits.monthlyLimit}
                        onChange={(e) => updateComplianceModule('dayMonthLimits', { monthlyLimit: e.target.value })}
                      />
                    </div>
                    <p className="col-span-2 text-xs text-slate-500">
                      Agents bypass this check. On-chain: <code>DayMonthLimitsModule</code>
                    </p>
                  </div>
                )}
              </div>

              {/* Exchange Monthly Limits Module */}
              <div className="rounded-lg border border-pink-500/20 p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.complianceModules.exchangeMonthlyLimits.enabled}
                    onChange={(e) => updateComplianceModule('exchangeMonthlyLimits', { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-ink">Exchange Monthly Deposit Limit</p>
                    <p className="text-xs text-slate-400">
                      Limits how many tokens each investor can deposit into registered exchange wallets per month.
                    </p>
                  </div>
                </label>
                {formData.complianceModules.exchangeMonthlyLimits.enabled && (
                  <div className="mt-3 space-y-3 pl-7">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-300">Exchange wallet addresses (one per line)</label>
                      <textarea
                        className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark] min-h-[70px] font-mono text-xs"
                        placeholder={'0xExchangeWallet1\n0xExchangeWallet2'}
                        value={formData.complianceModules.exchangeMonthlyLimits.exchangeAddresses}
                        onChange={(e) => updateComplianceModule('exchangeMonthlyLimits', { exchangeAddresses: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-300">Monthly deposit limit per investor (tokens)</label>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark] max-w-xs text-sm"
                        placeholder="e.g. 50000"
                        value={formData.complianceModules.exchangeMonthlyLimits.monthlyLimit}
                        onChange={(e) => updateComplianceModule('exchangeMonthlyLimits', { monthlyLimit: e.target.value })}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      On-chain: <code>ExchangeMonthlyLimitsModule</code>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-ink">Blockchain Selection</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {chainOptions.map((chain) => {
                const chainId = chainIdMap[chain.id];
                const isConfigured = !!getTREXGatewayAddress(chainId);

                return (
                <button
                  key={chain.id}
                  onClick={() => updateField('blockchain', chain.id)}
                  disabled={!isConfigured}
                  className={`rounded-lg border-2 p-4 text-left transition-colors ${
 formData.blockchain === chain.id
 ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700' } ${!isConfigured ? 'cursor-not-allowed opacity-50' : ''}`}
                  title={!isConfigured ? 'TREX gateway address not configured for this network' : undefined}
                >
                  <p className="font-semibold text-ink">{chain.name}</p>
                  <p className="text-sm text-slate-400">{chain.desc}</p>
                  <p className={`mt-2 text-xs font-medium ${isConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isConfigured ? 'Gateway configured' : 'Gateway not configured'}
                  </p>
                </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-400">
              Networks with a configured TREX gateway in this deployment are available for token creation.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Token Standard</label>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 [color-scheme:dark] max-w-xs"
                value={formData.standard}
                onChange={(e) => updateField('standard', e.target.value)}
              >
                <option value="ERC-3643">ERC-3643 (T-REX)</option>
                <option value="ERC-1400">ERC-1400</option>
                <option value="ERC-20">ERC-20 (basic)</option>
              </select>
            </div>

            {/* Deployer account indicator */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-800/40 p-3.5">
              <div className="flex items-center gap-2.5">
                <Wallet className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-xs font-semibold text-ink">Deployer Account (MetaMask)</p>
                  <p className="font-mono text-xs text-slate-400">
                    {isConnected && address ? address : 'No wallet connected'}
                  </p>
                </div>
              </div>
              {isConnected && address ? (
                <button
                  type="button"
                  onClick={handleSwitchAccount}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-slate-600 hover:text-ink"
                >
                  <RefreshCw className="h-3 w-3" />
                  Switch Account
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectWallet}
                  disabled={isConnecting}
                  className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-slate-950 transition-colors hover:bg-accent/90"
                >
                  {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
                </button>
              )}
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-ink">Review & Deploy</h3>

            {/* Deployer Wallet Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-ink">Deployer MetaMask Account</h4>
                    <p className="text-xs text-slate-400">
                      You can deploy with any connected MetaMask account. It will be set as the on-chain Token Owner.
                    </p>
                  </div>
                </div>

                {isConnected && address ? (
                  <button
                    type="button"
                    onClick={handleSwitchAccount}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-700"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Switch MetaMask Account
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectWallet}
                    disabled={isConnecting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-slate-950 transition-all hover:bg-accent/90"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
                  </button>
                )}
              </div>

              {isConnected && address ? (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3">
                    <p className="text-xs text-slate-400">Connected Account</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                      <p className="font-mono text-xs font-semibold text-ink truncate" title={address}>
                        {address.slice(0, 10)}...{address.slice(-8)}
                      </p>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(address)}
                        className="text-slate-500 hover:text-slate-300"
                        title="Copy Address"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3">
                    <p className="text-xs text-slate-400">Deployment Network</p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink capitalize">
                        {formData.blockchain} {targetChainId ? `(${targetChainId})` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3">
                    <p className="text-xs text-slate-400">Account Gas Balance</p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {balance ? `${parseFloat(balance.formatted).toFixed(4)} ${balance.symbol}` : 'Checking...'}
                    </p>
                    {balance && parseFloat(balance.formatted) === 0 && (
                      <p className="mt-1 text-[11px] text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Requires {targetChainId === 5042002 ? 'test USDC' : 'the network’s native token'} for gas fees
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/30 p-3 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
                    <span>Wallet connection is optional now. You will sign the on-chain deployment with your MetaMask account after platform approval.</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleConnectWallet}
                    disabled={isConnecting}
                    className="ml-3 shrink-0 rounded-md bg-accent/20 text-accent px-2.5 py-1 text-xs font-semibold hover:bg-accent/30 transition-colors"
                  >
                    {isConnecting ? 'Connecting...' : 'Connect Now'}
                  </button>
                </div>
              )}
            </div>

            {deployError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                <p>{deployError}</p>
                {createdTokenId && (
                  <Link
                    href={`/issuer/tokens/${createdTokenId}`}
                    className="mt-2 inline-flex font-medium text-red-300 underline"
                  >
                    Open token draft
                  </Link>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-4">
                <h4 className="mb-3 font-medium text-ink">Token Details</h4>
                <dl className="space-y-2 text-sm">
                  {logoPreview && (
                    <div className="flex items-center gap-3 pb-2 border-b border-slate-800">
                      <img src={logoPreview} alt="logo" className="h-10 w-10 rounded-lg border border-slate-700 bg-slate-800/60 object-contain p-0.5" />
                      <span className="text-slate-400 text-xs">Token Logo</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Name</dt>
                    <dd className="font-medium text-ink">{formData.name || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Symbol</dt>
                    <dd className="font-medium text-ink">{formData.symbol || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Asset Type</dt>
                    <dd className="font-medium text-ink capitalize">{formData.assetType?.replace('_', ' ') || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Standard</dt>
                    <dd className="font-medium text-ink">{formData.standard}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-4">
                <h4 className="mb-3 font-medium text-ink">Supply & Pricing</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Total Supply</dt>
                    <dd className="font-medium text-ink">
                      {normalizedTotalSupply
                        ? BigInt(normalizedTotalSupply).toLocaleString('en-US')
                        : formData.totalSupply || '-'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Initial Price</dt>
                    <dd className="font-medium text-ink">{formData.initialPrice ? `$${formData.initialPrice}` : '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Minimum Investment</dt>
                    <dd className="font-medium text-ink">{formData.minInvestment ? `${formData.minInvestment} tokens` : 'None'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Maximum Investment</dt>
                    <dd className="font-medium text-ink">{formData.maxInvestment ? `${formData.maxInvestment} tokens` : 'None'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Blockchain</dt>
                    <dd className="font-medium text-ink capitalize">{formData.blockchain || '-'}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-4 md:col-span-2">
                <h4 className="mb-3 font-medium text-ink">Compliance</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-400">KYC Required</dt>
                    <dd className="font-medium text-ink">{formData.kycRequired ? 'Yes' : 'No'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Accredited Only</dt>
                    <dd className="font-medium text-ink">{formData.accreditedOnly ? 'Yes' : 'No'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Transfer Restrictions</dt>
                    <dd className="font-medium text-ink">{formData.transferRestrictions ? 'Enabled' : 'Disabled'}</dd>
                  </div>
                </dl>
              </div>

              {/* Compliance Modules summary */}
              {(formData.complianceModules.countryRestrict.enabled ||
                formData.complianceModules.maxHolders.enabled ||
                formData.complianceModules.transferWindow.enabled ||
                formData.complianceModules.supplyLimit.enabled ||
                formData.complianceModules.maxBalance.enabled ||
                formData.complianceModules.dayMonthLimits.enabled ||
                formData.complianceModules.exchangeMonthlyLimits.enabled) && (
                <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-4 md:col-span-2">
                  <h4 className="mb-3 font-medium text-ink">On-chain Compliance Modules</h4>
                  <ul className="space-y-1.5 text-sm">
                    {formData.complianceModules.countryRestrict.enabled && (
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        <span className="text-slate-300">
                          <span className="font-medium">Country Restrictions</span>
                          {formData.complianceModules.countryRestrict.restrictedCountries.length > 0
                            ? ` — blocked: ${formData.complianceModules.countryRestrict.restrictedCountries.join(', ')}`
                            : ' — (no countries selected yet)'}
                        </span>
                      </li>
                    )}
                    {formData.complianceModules.maxHolders.enabled && (
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        <span className="text-slate-300">
                          <span className="font-medium">Max Holders</span>
                          {formData.complianceModules.maxHolders.max
                            ? ` — limit: ${Number(formData.complianceModules.maxHolders.max).toLocaleString('en-US')}`
                            : ' — (no limit set)'}
                        </span>
                      </li>
                    )}
                    {formData.complianceModules.transferWindow.enabled && (
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        <span className="text-slate-300">
                          <span className="font-medium">Transfer Window (Blackout)</span>
                          {' — configure blackout periods post-deployment'}
                        </span>
                      </li>
                    )}
                    {formData.complianceModules.supplyLimit.enabled && (
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" />
                        <span className="text-slate-300">
                          <span className="font-medium">Supply Limit</span>
                          {formData.complianceModules.supplyLimit.limit
                            ? ` — max supply: ${Number(formData.complianceModules.supplyLimit.limit).toLocaleString('en-US')} tokens`
                            : ' — (no limit set)'}
                        </span>
                      </li>
                    )}
                    {formData.complianceModules.maxBalance.enabled && (
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                        <span className="text-slate-300">
                          <span className="font-medium">Max Balance per Wallet</span>
                          {formData.complianceModules.maxBalance.max
                            ? ` — max: ${Number(formData.complianceModules.maxBalance.max).toLocaleString('en-US')} tokens`
                            : ' — (no limit set)'}
                        </span>
                      </li>
                    )}
                    {formData.complianceModules.dayMonthLimits.enabled && (
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                        <span className="text-slate-300">
                          <span className="font-medium">Daily/Monthly Limits</span>
                          {` — daily: ${formData.complianceModules.dayMonthLimits.dailyLimit || '∞'}, monthly: ${formData.complianceModules.dayMonthLimits.monthlyLimit || '∞'}`}
                        </span>
                      </li>
                    )}
                    {formData.complianceModules.exchangeMonthlyLimits.enabled && (
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-pink-400" />
                        <span className="text-slate-300">
                          <span className="font-medium">Exchange Monthly Limit</span>
                          {formData.complianceModules.exchangeMonthlyLimits.monthlyLimit
                            ? ` — ${Number(formData.complianceModules.exchangeMonthlyLimits.monthlyLimit).toLocaleString('en-US')} tokens/month per investor`
                            : ' — (no limit set)'}
                        </span>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
          disabled={currentStep === 1}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition-all hover:bg-slate-800 disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </button>
        {currentStep < 5 ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDeploy}
              disabled={deploying}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition-all hover:bg-accent hover:text-slate-950 disabled:opacity-50"
            >
              {deploying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  Submit for Approval
                  <Check className="h-4 w-4" />
                </>
              )}
            </button>
            <button
              onClick={() => setCurrentStep((s) => Math.min(5, s + 1))}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:-translate-y-0.5"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleDeploy}
            disabled={deploying}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
          >
            {deploying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting for approval...
              </>
            ) : (
              <>
                Submit for Approval
                <Check className="h-4 w-4" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
