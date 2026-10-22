import type { ExecutionResult } from '../../../execution/ExecutionResult';
import { listJoin } from '../text/match';

/**
 * Sentences for what the tools did -- built only from their results, never from the model's
 * text, so the assistant can't claim a change that didn't happen (SRS §20.6).
 */
export function describeResults(result: ExecutionResult): string {
  if (result.steps.length === 0) {
    if (result.status === 'FAILED') {
      const err = result.errors[0]?.replace(/^Validation failed:\s*/i, '');
      return err || result.summary || 'Something went wrong on my side. Please try that again.';
    }
    return "I didn't need to change anything.";
  }

  const sentences: string[] = [];
  for (const step of result.steps) {
    const output = (step.output ?? {}) as { message?: string; error?: string; success?: boolean };
    if (step.status === 'SUCCESS' && output.message) sentences.push(output.message);
    else if (step.status === 'SUCCESS') sentences.push('Done.');
    else sentences.push(step.error || output.error || "One of those steps didn't work, so I left it.");
  }
  return mergeShelfPuts(sentences).join(' ');
}

/** "I've put A on your "X" shelf. I've put B on your "X" shelf." -> "I've put A and B on your "X" shelf." */
function mergeShelfPuts(sentences: string[]): string[] {
  const pattern = /^I've put (.+) on your "(.+)" shelf\.$/;
  const out: string[] = [];
  const names: Record<number, string[]> = {};
  for (const sentence of sentences) {
    const m = sentence.match(pattern);
    const lastIndex = out.length - 1;
    const prev = lastIndex >= 0 ? out[lastIndex]!.match(pattern) : null;
    if (m && prev && prev[2] === m[2]) {
      names[lastIndex] = [...(names[lastIndex] ?? [prev[1]!]), m[1]!];
      out[lastIndex] = `I've put ${listJoin(names[lastIndex]!)} on your "${m[2]}" shelf.`;
    } else {
      out.push(sentence);
    }
  }
  return out;
}
