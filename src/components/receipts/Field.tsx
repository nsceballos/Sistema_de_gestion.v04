import type { ReactNode } from 'react';

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  /** Acción junto al error (p. ej. "Usar N° 0054") */
  errorAction?: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Field({ id, label, error, errorAction, hint, className, children }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
          {errorAction && <> {errorAction}</>}
        </p>
      ) : (
        hint && <div id={`${id}-hint`}>{hint}</div>
      )}
    </div>
  );
}
