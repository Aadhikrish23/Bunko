import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className = '', ...rest },
  ref,
) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-paper-800">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={`focus-visible:focus-ring rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm text-paper-900 placeholder:text-paper-400 ${error ? 'border-ember-500' : ''} ${className}`}
        aria-invalid={Boolean(error)}
        {...rest}
      />
      {error && <p className="text-sm text-ember-600">{error}</p>}
    </div>
  );
});
