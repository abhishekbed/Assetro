'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '@/lib/api';

const createTenantSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  domain: z.string().optional(),
  plan: z.enum(['free', 'starter', 'professional', 'enterprise']),
});

type CreateTenantForm = z.infer<typeof createTenantSchema>;

export default function CreateTenantPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<CreateTenantForm>({
    resolver: zodResolver(createTenantSchema),
    defaultValues: { plan: 'starter' },
  });

  const selectedPlan = watch('plan');

  const onSubmit = async (data: CreateTenantForm) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post('/admin/tenants', {
        name: data.name,
        slug: data.slug,
        domain: data.domain || undefined,
        plan: data.plan,
      });
      const tenantId = res.data?.id;
      router.push(tenantId ? `/tenants/${tenantId}` : '/tenants');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to create tenant';
      setError(typeof message === 'string' ? message : JSON.stringify(message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/tenants"
        className="inline-flex items-center gap-1 text-sm text-secondary-500 hover:text-secondary-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Tenants
      </Link>

      <h1 className="text-2xl font-bold text-secondary-900">Create New Tenant</h1>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <div className="card p-6">
          <h3 className="mb-4 text-lg font-semibold text-secondary-900">
            Tenant Information
          </h3>
          <div className="space-y-4">
            <div>
              <label className="label mb-1 block">Organization Name</label>
              <input className="input-field" placeholder="Acme Corp" {...register('name')} />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label mb-1 block">Slug</label>
              <input className="input-field" placeholder="acme-corp" {...register('slug')} />
              {errors.slug && <p className="mt-1 text-xs text-red-500">{errors.slug.message}</p>}
              <p className="mt-1 text-xs text-secondary-400">Used in URLs and API routing</p>
            </div>
            <div>
              <label className="label mb-1 block">Custom Domain (optional)</label>
              <input className="input-field" placeholder="tokens.acme.com" {...register('domain')} />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="mb-4 text-lg font-semibold text-secondary-900">Plan Selection</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { id: 'free', name: 'Free', price: '$0/mo', features: ['Up to 10 users', '1 token', 'Community support'] },
              { id: 'starter', name: 'Starter', price: '$99/mo', features: ['Up to 100 users', '2 tokens', 'Basic support'] },
              { id: 'professional', name: 'Professional', price: '$499/mo', features: ['Up to 1,000 users', '10 tokens', 'Priority support'] },
              { id: 'enterprise', name: 'Enterprise', price: 'Custom', features: ['Unlimited users', 'Unlimited tokens', 'Dedicated support'] },
            ].map((plan) => (
              <label
                key={plan.id}
                className={`cursor-pointer rounded-lg border-2 p-4 transition-colors ${
 selectedPlan === plan.id
 ? 'border-primary-500 bg-primary-50' : 'border-secondary-200 hover:border-secondary-300' }`}
              >
                <input
                  type="radio"
                  value={plan.id}
                  className="sr-only"
                  {...register('plan')}
                />
                <p className="font-semibold text-secondary-900">{plan.name}</p>
                <p className="text-sm text-primary-600">{plan.price}</p>
                <ul className="mt-2 space-y-1">
                  {plan.features.map((f) => (
                    <li key={f} className="text-xs text-secondary-500">
                      {f}
                    </li>
                  ))}
                </ul>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Link href="/tenants" className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Tenant
          </button>
        </div>
      </form>
    </div>
  );
}
