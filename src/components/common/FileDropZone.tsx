import { useId, useState, type DragEvent } from 'react';

interface FileDropZoneProps {
  /** Visible button text. */
  label: string;
  /** Stable accessible name for the file input. */
  inputLabel: string;
  /** `accept` attribute for the file input, e.g. `.zip,application/zip`. */
  accept: string;
  hint?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}

/** File picker button that also accepts drag and drop. Presentational: it only reports the file. */
export function FileDropZone({
  label,
  inputLabel,
  accept,
  hint,
  disabled = false,
  onFile,
}: FileDropZoneProps) {
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (!disabled && file) {
      onFile(file);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
        isDragging ? 'border-orange-400 bg-orange-50' : 'border-slate-300 bg-slate-50'
      }`}
    >
      <label
        htmlFor={inputId}
        className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm focus-within:ring-2 focus-within:ring-orange-500 focus-within:ring-offset-2 ${
          disabled
            ? 'cursor-not-allowed bg-slate-200 text-slate-500'
            : 'cursor-pointer bg-orange-500 text-white hover:bg-orange-600'
        }`}
      >
        {label}
        <input
          id={inputId}
          type="file"
          accept={accept}
          aria-label={inputLabel}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so choosing the same file again still fires a change event.
            event.target.value = '';
            if (file) {
              onFile(file);
            }
          }}
        />
      </label>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
