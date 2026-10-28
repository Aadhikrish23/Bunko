import { ArrowUp, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useAiStatus } from '../../lib/api/ai';
import { useAssistantChat, useResetAssistant } from '../../lib/api/assistant';
import { ApiError } from '../../lib/api/client';
import { useWorks } from '../../lib/api/works';
import { useAuth } from '../../lib/auth-context';
import { errorMessage } from '../../lib/error-message';
import { usePrefersReducedMotion } from '../../lib/use-reduced-motion';
import { ConsentGate } from './ConsentGate';
import { Starters } from './Starters';
import { AssistantTurn } from './AssistantTurn';
import { capTurns, loadThread, saveThread, retireChoices, turnFromReply, type Turn } from './thread';

const MAX_LENGTH = 2_000;

let nextId = 0;
const newId = () => `${Date.now().toString(36)}-${(nextId++).toString(36)}`;

/**
 * The floating Assistant as an overlay panel (Phase 13, T-112 — supersedes
 * SRS §20.6's "the Assistant page becomes a chat"). Thread state, the chat
 * API hook, and toBlocks/markTitles-based rendering are unchanged from the
 * old full-page AssistantChatPage; only the shell around them changed.
 */
export function AssistantDrawer({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const userId = user?.id ?? 'anonymous';
  const status = useAiStatus();
  const chat = useAssistantChat();
  const reset = useResetAssistant();
  const works = useWorks({ pageSize: 100 });
  const reducedMotion = usePrefersReducedMotion();
  const [turns, setTurns] = useState<Turn[]>(() => loadThread(userId));
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const titles = useMemo(() => (works.data?.items ?? []).map((w) => w.title), [works.data]);
  const sample = useMemo(() => {
    const items = works.data?.items ?? [];
    return {
      reading: items.find((w) => w.status === 'READING')?.title,
      next: items.find((w) => w.status === 'WANT_TO_READ')?.title,
    };
  }, [works.data]);

  useEffect(() => saveThread(userId, turns), [userId, turns]);
  // Open at the latest message; glide to new ones after that (instant with reduced motion).
  const hasScrolled = useRef(false);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const smooth = hasScrolled.current && !reducedMotion;
    hasScrolled.current = true;
    requestAnimationFrame(() => scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));
  }, [turns.length, chat.isPending, reducedMotion, status.isLoading]);

  // The composer grows with what's typed, up to a few lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [draft]);

  // Opening the drawer focuses the composer, same as the old page did on load.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function send(text: string) {
    const message = text.trim().slice(0, MAX_LENGTH);
    if (!message || chat.isPending) return;
    setTurns((prev) => capTurns([...retireChoices(prev), { id: newId(), role: 'reader', text: message }]));
    setDraft('');
    chat.mutate(message, {
      onSuccess: (reply) => setTurns((prev) => [...prev, turnFromReply(newId(), reply)]),
      onError: (error) => {
        if (error instanceof ApiError && error.status === 403) {
          void status.refetch();
          return;
        }
        const unavailable = !(error instanceof ApiError) || error.status === 503;
        const text = unavailable
          ? error instanceof ApiError
            ? error.message
            : 'I couldn’t reach Bunko just now. Check your connection, then try again.'
          : errorMessage(error, 'Something went wrong on my side. Please try that again.');
        setTurns((prev) => [
          ...prev,
          {
            id: newId(),
            role: 'assistant',
            text,
            status: 'UNAVAILABLE',
            retry: unavailable ? message : undefined,
          },
        ]);
      },
      onSettled: () => inputRef.current?.focus(),
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    send(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(draft);
    }
  }

  function clear() {
    reset.mutate(undefined, {
      onSettled: () => {
        setTurns([]);
        inputRef.current?.focus();
      },
    });
  }

  function retry(message: string) {
    setTurns((prev) =>
      retireChoices(prev).filter(
        (t, i, all) => !(i === all.length - 1 && t.role === 'assistant' && t.status === 'UNAVAILABLE'),
      ),
    );
    // Resend without echoing the reader's line twice.
    chat.mutate(message, {
      onSuccess: (reply) => setTurns((prev) => [...prev, turnFromReply(newId(), reply)]),
      onError: (error) =>
        setTurns((prev) => [
          ...prev,
          {
            id: newId(),
            role: 'assistant',
            text: errorMessage(error, 'Still no luck. Please try again in a minute.'),
            status: 'UNAVAILABLE',
            retry: message,
          },
        ]),
    });
  }

  const consentOff = status.data && !status.data.consent.generative;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:inset-auto sm:bottom-24 sm:right-6">
      {/* Backdrop: full-bleed on phone (where the drawer is a sheet), invisible on desktop
          (where it's a floating panel and the launcher stays reachable). */}
      <button
        type="button"
        aria-label="Close the assistant"
        onClick={onClose}
        className="absolute inset-0 bg-black/20 sm:hidden"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Assistant"
        className="relative flex h-[85dvh] w-full flex-col rounded-t-2xl border border-paper-200 bg-paper-50 shadow-2xl sm:h-[70vh] sm:w-[420px] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-paper-200 p-4">
          <div>
            <h1 className="font-display text-lg text-paper-900">Assistant</h1>
            <p className="mt-0.5 text-xs text-paper-700">Your library, in your own words.</p>
          </div>
          <div className="flex items-center gap-1">
            {turns.length > 0 && !consentOff && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clear}
                isLoading={reset.isPending}
                aria-label="Clear the conversation"
              >
                <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the assistant"
              className="focus-visible:focus-ring rounded-md p-1.5 text-paper-600 hover:bg-paper-200/70"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 [scrollbar-color:theme(colors.paper.300)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin]"
        >
          {status.isLoading ? (
            <div className="flex flex-col gap-3 py-6" aria-label="Loading the assistant">
              <div className="h-5 w-48 rounded bg-paper-100 motion-safe:animate-pulse" />
              <div className="h-3.5 w-64 max-w-full rounded bg-paper-100 motion-safe:animate-pulse" />
            </div>
          ) : status.isError ? (
            <div className="py-6">
              <ErrorBanner message={errorMessage(status.error, 'Could not load the assistant.')} />
            </div>
          ) : consentOff ? (
            <ConsentGate />
          ) : (
            <>
              {turns.length === 0 ? (
                <Starters
                  onPick={(text) => {
                    setDraft(text);
                    inputRef.current?.focus();
                  }}
                  sample={sample}
                />
              ) : (
                <ol className="flex flex-col gap-4 py-4" role="log" aria-live="polite" aria-label="Conversation">
                  {turns.map((turn, index) => (
                    <li key={turn.id} className={`flex ${turn.role === 'reader' ? 'justify-end' : 'justify-start'}`}>
                      {turn.role === 'reader' ? (
                        <p className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-md border border-paper-200 bg-paper-100 px-3.5 py-2 text-sm leading-relaxed text-paper-900">
                          <span className="sr-only">You: </span>
                          {turn.text}
                        </p>
                      ) : (
                        <AssistantTurn
                          turn={turn}
                          titles={titles}
                          busy={chat.isPending || index !== turns.length - 1}
                          onChoose={send}
                          onRetry={retry}
                        />
                      )}
                    </li>
                  ))}
                  {chat.isPending && (
                    <li className="flex flex-col gap-2" aria-label="The assistant is replying">
                      <div className="h-3 w-40 max-w-full rounded-full bg-paper-200 motion-safe:animate-pulse" />
                      <div className="h-3 w-28 rounded-full bg-paper-200 motion-safe:animate-pulse" />
                    </li>
                  )}
                </ol>
              )}
            </>
          )}
        </div>

        {!status.isLoading && !status.isError && !consentOff && (
          <form onSubmit={handleSubmit} className="shrink-0 border-t border-paper-200 p-3">
            <label htmlFor="assistant-message" className="sr-only">
              Message the assistant
            </label>
            <div className="flex items-end gap-2 rounded-xl border border-paper-300 bg-paper-50 p-1.5 shadow-card transition-colors duration-150 focus-within:border-moss-600">
              <textarea
                id="assistant-message"
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                maxLength={MAX_LENGTH}
                placeholder="Tell me what you’re reading…"
                className="max-h-42 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed text-paper-900 placeholder:text-paper-600 focus:outline-none"
              />
              <Button
                type="submit"
                aria-label="Send"
                disabled={!draft.trim()}
                isLoading={chat.isPending}
                className="h-9 w-9 !px-0"
              >
                {!chat.isPending && <ArrowUp aria-hidden="true" className="h-4 w-4" strokeWidth={2} />}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
