import React, { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { FullPageSpinner } from '../../auth/RequireAuth';
import { Button } from '../../components/ui/Button';
import { Brand, Field, FormError } from '../auth/AuthLayout';
import { countryOptions, currencyOptions, defaultsFor, guessCountry, timezoneOptions, type Option } from '../../lib/regions';
import { cn } from '../../lib/utils';

const SelectField: React.FC<{
  label: string; name: string; value: string; options: Option[]; onChange: (v: string) => void;
  hint?: string; placeholder?: string;
}> = ({ label, name, value, options, onChange, hint, placeholder }) => (
  <div className="space-y-1.5">
    <label htmlFor={name} className="block text-xs font-medium text-zinc-700">{label}</label>
    <select
      id={name}
      name={name}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {value && !options.some(o => o.value === value) && <option value={value}>{value}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
  </div>
);

const STEPS = ['Your company', 'Money and time'];

/**
 * Step 1.4: first-run setup for a new workspace. Owners and managers see it once, until
 * organizations.onboarding_completed_at is set. Adding the first listing joins this flow in Phase 2.
 */
export const OnboardingPage: React.FC = () => {
  const { loading, workspace, refreshWorkspaces } = useAuth();
  const navigate = useNavigate();
  const countries = useMemo(countryOptions, []);
  const currencies = useMemo(currencyOptions, []);
  const timezones = useMemo(timezoneOptions, []);

  const initialCountry = workspace?.country ?? guessCountry();
  const initialDefaults = defaultsFor(initialCountry);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(workspace && workspace.name !== 'My workspace' ? workspace.name : '');
  const [country, setCountry] = useState(initialCountry);
  const [currency, setCurrency] = useState(workspace?.base_currency && workspace.base_currency !== 'USD' ? workspace.base_currency : initialDefaults.currency);
  const [timezone, setTimezone] = useState(workspace?.timezone && workspace.timezone !== 'UTC' ? workspace.timezone : initialDefaults.timezone);
  const [touched, setTouched] = useState({ currency: false, timezone: false });
  const [taxId, setTaxId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <FullPageSpinner />;
  if (!workspace) return <Navigate to="/app/dashboard" replace />;
  if (workspace.onboarding_completed_at || !['owner', 'manager'].includes(workspace.role)) {
    return <Navigate to="/app/dashboard" replace />;
  }

  const chooseCountry = (code: string) => {
    setCountry(code);
    const d = defaultsFor(code);
    if (!touched.currency) setCurrency(d.currency);
    if (!touched.timezone) setTimezone(d.timezone);
  };

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Enter your company name.'); return; }
    if (!country) { setError('Choose the country you operate in.'); return; }
    setError(null);
    setStep(1);
  };

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase
      .from('organizations')
      .update({
        name: name.trim(),
        country,
        base_currency: currency,
        timezone,
        tax_id: taxId.trim() || null,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', workspace.id);
    if (error) {
      setBusy(false);
      setError(error.message.includes('timezone') ? 'That timezone is not recognised. Please choose another.' : 'Could not save. Please try again.');
      return;
    }
    await refreshWorkspaces();
    navigate('/app/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <Brand className="mb-10" />

        <ol className="flex items-center gap-3 mb-8" aria-label="Setup progress">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2 text-xs" aria-current={i === step ? 'step' : undefined}>
              <span className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center font-semibold border',
                i < step ? 'bg-emerald-600 border-emerald-600 text-white'
                  : i === step ? 'border-zinc-900 text-zinc-900' : 'border-zinc-300 text-zinc-400',
              )}>
                {i < step ? <Check size={13} /> : i + 1}
              </span>
              <span className={i === step ? 'font-medium text-zinc-900' : 'text-zinc-400'}>{label}</span>
              {i < STEPS.length - 1 && <span className="w-8 h-px bg-zinc-200" />}
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <form onSubmit={next} className="space-y-5" noValidate>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Set up your workspace</h1>
              <p className="mt-2 text-sm text-zinc-500">Two quick steps before you add your listings.</p>
            </div>
            <Field label="Company name" name="company" autoComplete="organization" maxLength={120} required value={name} onChange={e => setName(e.target.value)} hint="Shown on reports and owner statements." />
            <SelectField label="Country you operate in" name="country" value={country} options={countries} onChange={chooseCountry} placeholder="Choose a country" />
            <FormError message={error} />
            <Button type="submit" size="lg" className="w-full">Continue</Button>
          </form>
        ) : (
          <form onSubmit={finish} className="space-y-5" noValidate>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Money and time</h1>
              <p className="mt-2 text-sm text-zinc-500">Your profit and loss is reported in this currency, and each day closes at midnight in this timezone.</p>
            </div>
            <SelectField label="Reporting currency" name="currency" value={currency} options={currencies}
              onChange={v => { setCurrency(v); setTouched(t => ({ ...t, currency: true })); }} />
            <SelectField label="Timezone" name="timezone" value={timezone} options={timezones}
              onChange={v => { setTimezone(v); setTouched(t => ({ ...t, timezone: true })); }} />
            <Field label="Tax or VAT number (optional)" name="tax_id" maxLength={64} value={taxId} onChange={e => setTaxId(e.target.value)} hint="Printed on owner statements. Leave blank if you are not registered." />
            <FormError message={error} />
            <div className="flex gap-3">
              <Button type="button" variant="outline" size="lg" onClick={() => { setError(null); setStep(0); }} disabled={busy}>Back</Button>
              <Button type="submit" size="lg" className="flex-1" disabled={busy}>{busy ? 'Saving…' : 'Finish setup'}</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
