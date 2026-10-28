import axios from 'axios';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

// NVIDIA's hosted image-generation models live under a different host/path
// than the chat-completions endpoint the assistant uses
// (backend/src/modules/assistant/clients/NvidiaNimClient.ts) -- confirmed
// against NVIDIA's own docs and by a live call during T-109's
// implementation. This is a background, best-effort enhancement (never
// blocks adding a book), so a generous timeout is fine; a failure here
// just means the reader keeps the existing placeholder spine
// (spine-style.ts) -- not an error shown to anyone.
const IMAGE_GEN_BASE_URL = env.NVIDIA_IMAGE_BASE_URL;
const IMAGE_GEN_MODEL = env.NVIDIA_IMAGE_MODEL;
const TIMEOUT_MS = 90_000;

export interface SpineArtResult {
  /** JPEG bytes. */
  image: Buffer;
}

function buildPrompt(title: string, authors: string[], language: string | null): string {
  const author = authors[0] ? ` by ${authors[0]}` : '';
  const languageNote = language && language.toLowerCase() !== 'en' ? ` The title text should be rendered in ${language}.` : '';
  return (
    `A vertical book spine illustration for "${title}"${author}. Elegant, minimal cover-spine design ` +
    `suitable for a personal digital bookshelf, with the title legibly printed on the spine.${languageNote} ` +
    `No people, no photorealistic faces, tasteful typography, portrait orientation.`
  );
}

/**
 * Generates spine art for a book with no cover/spine image supplied, via a
 * single NVIDIA-hosted text-to-image model (no multi-model fallback here,
 * unlike the chat client -- image models are heavier and this call is
 * already best-effort). Returns null on any failure; never throws, so a
 * caller can always safely treat the result as "use the placeholder
 * instead."
 */
export async function generateSpineArt(title: string, authors: string[], language: string | null): Promise<SpineArtResult | null> {
  if (!env.NVIDIA_API_KEY) return null;

  try {
    const response = await axios.post<{ artifacts?: { base64?: string; finishReason?: string }[] }>(
      `${IMAGE_GEN_BASE_URL}/${IMAGE_GEN_MODEL}`,
      {
        prompt: buildPrompt(title, authors, language),
        mode: 'base',
        seed: 0,
        steps: 4,
        cfg_scale: 0,
      },
      {
        headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        timeout: TIMEOUT_MS,
      },
    );

    const artifact = response.data.artifacts?.[0];
    if (!artifact?.base64 || artifact.finishReason === 'ERROR') {
      logger.warn({ title, finishReason: artifact?.finishReason }, 'Spine art generation returned no usable image');
      return null;
    }
    return { image: Buffer.from(artifact.base64, 'base64') };
  } catch (err) {
    logger.warn({ err, title }, 'Spine art generation failed; keeping the placeholder');
    return null;
  }
}
