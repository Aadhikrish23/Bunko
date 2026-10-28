import { forwardRef, useId, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className = '', ...rest },
  ref,
) {
  // Label and input are visual siblings (not nested), so without an id
  // they have no programmatic association at all — not to assistive tech,
  // and not to anything else that finds a field by its label (e.g.
  // Playwright's getByLabel). Almost no call site passes its own id, so
  // this generates a stable one by default rather than leaving every
  // Input silently unlabelled whenever the caller doesn't think to.
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-paper-800">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`focus-visible:focus-ring rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm text-paper-900 placeholder:text-paper-400 ${error ? 'border-ember-500' : ''} ${className}`}
        aria-invalid={Boolean(error)}
        {...rest}
      />
      {error && <p className="text-sm text-ember-600">{error}</p>}
    </div>
  );
});
