import { useEffect, useId, useState, type FormEvent } from 'react';
import { StatusMessage, type StatusTone } from '@/components/assistant/StatusMessage';

interface ConnectionSettingsProps {
  /** The label of the address setting, from the provider's settings. */
  label: string;
  help: string;
  serverUrl: string;
  status: { readonly text: string; readonly tone: StatusTone };
  /** The last connection test, in words; null before a test. */
  testResult: { readonly text: string; readonly tone: StatusTone } | null;
  problems: readonly string[];
  testing: boolean;
  onSave: (serverUrl: string) => void;
  onTest: (serverUrl: string) => void;
}

/**
 * The provider's server address with its status and a connection test (UX-14, BR-41).
 * Presentational: it reports the address to save or test.
 */
export function ConnectionSettings({
  label,
  help,
  serverUrl,
  status,
  testResult,
  problems,
  testing,
  onSave,
  onTest,
}: ConnectionSettingsProps) {
  const [address, setAddress] = useState(serverUrl);
  const inputId = useId();
  const helpId = useId();
  useEffect(() => setAddress(serverUrl), [serverUrl]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(address);
  };

  return (
    <div className="flex flex-col gap-3">
      <StatusMessage tone={status.tone} role="status">
        {status.text}
      </StatusMessage>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        <input
          id={inputId}
          type="url"
          value={address}
          aria-describedby={helpId}
          onChange={(event) => setAddress(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none"
        />
        <p id={helpId} className="text-xs text-slate-500">
          {help} Only addresses on this computer are accepted.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
          >
            Save address
          </button>
          <button
            type="button"
            disabled={testing}
            onClick={() => onTest(address)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
        </div>
      </form>
      {problems.length > 0 ? (
        <StatusMessage tone="error" role="alert">
          {problems.join(' ')}
        </StatusMessage>
      ) : null}
      {testResult ? (
        <StatusMessage tone={testResult.tone} role="status">
          {testResult.text}
        </StatusMessage>
      ) : null}
    </div>
  );
}
