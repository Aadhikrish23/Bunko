import { Sparkles } from 'lucide-react';

// SRS §20.3: generated insights must be labelled as interpretations, not
// facts. Shown on every piece of generated output.
export function AiLabel() {
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-paper-600">
      <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-moss-600" />
      AI-generated interpretation of your own notes — not a fact, and it can be wrong.
    </p>
  );
}
