import { useId, useState, type FormEvent } from 'react';
import { StatusMessage } from '@/components/assistant/StatusMessage';

/** One download, prepared by the caller (`describeDownload`). */
export interface DownloadEntry {
  readonly model: string;
  readonly running: boolean;
  readonly percent: number | null;
  readonly label: string;
  readonly tone: 'neutral' | 'ok' | 'warning' | 'error';
}

interface ModelDownloadsProps {
  downloads: readonly DownloadEntry[];
  /** Where to find model names, opened in the browser (OD-35); null when the provider has none. */
  library: { readonly url: string; readonly label: string } | null;
  onDownload: (name: string) => void;
  onCancel: (name: string) => void;
}

/**
 * Download a model by name, with progress and Cancel (UX-14, AC-48). Presentational: it reports
 * the name to download or the download to cancel.
 */
export function ModelDownloads({ downloads, library, onDownload, onCancel }: ModelDownloadsProps) {
  const [name, setName] = useState('');
  const inputId = useId();
  const helpId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;
    onDownload(name.trim());
    setName('');
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          Model name
        </label>
        <input
          id={inputId}
          value={name}
          placeholder="e.g. qwen3:8b"
          aria-describedby={helpId}
          onChange={(event) => setName(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none"
        />
        <p id={helpId} className="text-xs text-slate-500">
          Choose a model that supports tool calling. Models are large (an 8 B model is about 5 GB).
          Cloud models are not downloaded.{' '}
          {library ? (
            <a
              href={library.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-orange-700 underline"
            >
              {library.label}
            </a>
          ) : null}
        </p>
        <button
          type="submit"
          disabled={name.trim() === ''}
          className="self-start rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Download
        </button>
      </form>
      {downloads.length > 0 ? (
        <ul aria-label="Downloads" className="flex flex-col gap-2">
          {downloads.map((download) => (
            <li
              key={download.model}
              aria-label={`Download of ${download.model}`}
              className="flex flex-col gap-1.5"
            >
              <p className="text-sm font-medium break-all text-slate-800">{download.model}</p>
              {download.running ? (
                <progress
                  aria-label={`Progress of ${download.model}`}
                  max={100}
                  {...(download.percent !== null ? { value: download.percent } : {})}
                  className="h-2 w-full accent-orange-500"
                />
              ) : null}
              <StatusMessage tone={download.tone} role="status">
                {download.label}
              </StatusMessage>
              {download.running ? (
                <button
                  type="button"
                  onClick={() => onCancel(download.model)}
                  aria-label={`Cancel download of ${download.model}`}
                  className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
