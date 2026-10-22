import { forwardRef } from 'react';
import type { Soundtrack } from '../../lib/api/types';
import { EMBED_HEIGHT, PROVIDER_LABELS, isAllowedEmbedUrl, playerUrl } from './soundtrack-utils';

interface SoundtrackEmbedProps {
  soundtrack: Soundtrack;
  autoPlay?: boolean;
  onLoad?: () => void;
}

// The provider's official player (ARCHITECTURE.md §12). The sandbox keeps
// what players need — scripts, their own storage, "open in app" popups,
// sign-in via user activation — but never lets the embed navigate Bunko
// itself.
export const SoundtrackEmbed = forwardRef<HTMLIFrameElement, SoundtrackEmbedProps>(function SoundtrackEmbed(
  { soundtrack, autoPlay = false, onLoad },
  ref,
) {
  if (!isAllowedEmbedUrl(soundtrack.embedUrl)) {
    return <p className="text-sm text-ember-600">This playlist link can’t be played here.</p>;
  }

  return (
    <iframe
      ref={ref}
      onLoad={onLoad}
      src={playerUrl(soundtrack, { autoPlay, origin: window.location.origin })}
      title={`${PROVIDER_LABELS[soundtrack.provider]} player: ${soundtrack.name}`}
      height={EMBED_HEIGHT[soundtrack.provider]}
      className="w-full rounded-lg border-0 bg-paper-100"
      allow="autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation allow-storage-access-by-user-activation"
    />
  );
});
