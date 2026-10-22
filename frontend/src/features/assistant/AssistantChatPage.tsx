import { AlertCircle, ArrowUp, BookOpenCheck, Library, MessageCircleQuestion, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useAiStatus, useSetAiConsent } from '../../lib/api/ai';
import { useAssistantChat, useResetAssistant } from '../../lib/api/assistant';
import { ApiError } from '../../lib/api/client';
import { useWorks } from '../../lib/api/works';
import { useAuth } from '../../lib/auth-context';
import { errorMessage } from '../../lib/error-message';
import { usePrefersReducedMotion } from '../../lib/use-reduced-motion';
import { GENERATIVE_DISCLOSURE } from '../ai/ai-disclosure';
import {
  capTurns,
  loadThread,
  markTitles,
  retireChoices,
  saveThread,
  toBlocks,
  turnFromReply,
  type Turn,
} from './thread';

const MAX_LENGTH = 2_000;

let nextId = 0;
const newId = () => `${Date.now().toString(36)}-${(nextId++).toString(36)}`;

/** Prose with the reader's own book titles set in the book face (DESIGN.md: serif names it). */
function Prose({ text, titles }: { text: string; titles: string[] }) {
  const runs = (line: string) =>
    markTitles(line, titles).map((run, i) =>
      run.title ? (
        <span key={i} className="font-display font-medium text-paper-900">
          {run.text}
        </span>
      ) : (
        <span key={i}>{run.text}</span>
      ),
    );
  return (
    <div className="flex flex-col gap-2">
      {toBlocks(text).map((block, i) =>
        block.kind === 'p' ? (
          <p key={i}>{runs(block.text)}</p>
        ) : (
          <ul key={i} className="flex flex-col gap-1.5 pl-1">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-moss-600" />
                <span>{runs(item)}</span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

function AssistantTurn({
  turn,
  titles,
  onChoose,
  onRetry,
  busy,
}: {
  turn: Extract<Turn, { role: 'assistant' }>;
  titles: string[];
  onChoose: (label: string) => void;
  onRetry: (message: string) => void;
  busy: boolean;
}) {
  const problem = turn.status === 'LIMITED' || turn.status === 'UNAVAILABLE' || turn.status === 'FAILED';
  if (turn.status === 'CONFIRMATION_REQUIRED' && turn.choices) {
    return (
      <div className="w-full max-w-md rounded-xl border border-paper-200 bg-paper-50 p-4 shadow-card">
        <div className="text-[15px] font-medium leading-relaxed text-paper-900">
          <Prose text={turn.text} titles={titles} />
        </div>
        {turn.reason && <p className="mt-1.5 text-sm text-paper-700">{turn.reason}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {turn.choices.map((choice) => (
            <Button
              key={choice.label}
              size="sm"
              variant={choice.tone === 'danger' ? 'danger' : choice.tone === 'confirm' ? 'primary' : 'secondary'}
              disabled={busy}
              onClick={() => onChoose(choice.label)}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex max-w-[38rem] flex-col gap-3">
      <div className={`flex gap-2.5 text-[15px] leading-relaxed ${problem ? 'text-paper-800' : 'text-paper-900'}`}>
        {problem && (
          <AlertCircle aria-hidden="true" strokeWidth={1.75} className="mt-[0.2em] h-4 w-4 shrink-0 text-ember-600" />
        )}
        <Prose text={turn.text} titles={titles} />
      </div>
      {turn.choices && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose one">
          {turn.choices.map((choice) => (
            <Button
              key={choice.label}
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onChoose(choice.label)}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      )}
      {turn.retry && (
        <div>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRetry(turn.retry!)}>
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} /> Try again
          </Button>
        </div>
      )}
    </div>
  );
}

function Starters({ onPick, sample }: { onPick: (text: string) => void; sample: { reading?: string; next?: string } }) {
  const reading = sample.reading ?? 'Piranesi';
  const next = sample.next ?? 'Circe';
  const groups: { icon: ReactNode; label: string; examples: string[] }[] = [
    {
      icon: <BookOpenCheck strokeWidth={1.5} className="h-4 w-4" />,
      label: 'Log your reading',
      examples: [`I started ${next}`, `finished ${reading}, 5 stars`],
    },
    {
      icon: <Library strokeWidth={1.5} className="h-4 w-4" />,
      label: 'Tidy your shelves',
      examples: [`put ${next} on my comfort reads shelf`, 'create a shelf called book club'],
    },
    {
      icon: <MessageCircleQuestion strokeWidth={1.5} className="h-4 w-4" />,
      label: 'Ask about your library',
      examples: ["what's on my want to read list?", 'what should I read next?'],
    },
  ];
  return (
    <div className="flex flex-col gap-8 py-6 sm:py-10">
      <div className="max-w-lg">
        <h2 className="font-display text-2xl text-paper-900 text-balance">What happened in your reading?</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-paper-700">
          Tell me in your own words and I’ll update your library: what you started, finished or gave up on, how you’d
          rate it, notes, shelves. Or ask me anything about your books.
        </p>
      </div>
      <dl className="grid gap-6 sm:grid-cols-3 sm:gap-5">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-2.5 border-t border-paper-200 pt-4">
            <dt className="flex items-center gap-2 text-sm font-medium text-paper-800">
              <span className="text-moss-600" aria-hidden="true">
                {group.icon}
              </span>
              {group.label}
            </dt>
            {group.examples.map((example) => (
              <dd key={example}>
                <button
                  type="button"
                  onClick={() => onPick(example)}
                  className="focus-visible:focus-ring w-full rounded-md px-2 py-1.5 -mx-2 text-left text-sm text-paper-700 transition-colors duration-150 hover:bg-paper-100 hover:text-paper-900"
                >
                  “{example}”
                </button>
              </dd>
            ))}
          </div>
        ))}
      </dl>
    </div>
  );
}

function ConsentGate() {
  const status = useAiStatus();
  const setConsent = useSetAiConsent();
  const consent = status.data?.consent;
  return (
    <section className="max-w-lg py-6 sm:py-10" aria-labelledby="assistant-consent">
      <h2 id="assistant-consent" className="font-display text-2xl text-paper-900">
        Turn on the assistant
      </h2>
      <p className="mt-3 text-[15px] leading-relaxed text-paper-700">{GENERATIVE_DISCLOSURE}</p>
      <p className="mt-3 text-sm text-paper-600">
        This also turns on Search by meaning, which it builds on. You can turn either off in Settings at any time.
      </p>
      {setConsent.isError && (
        <div className="mt-4">
          <ErrorBanner message={errorMessage(setConsent.error, 'Could not turn it on. Please try again.')} />
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          isLoading={setConsent.isPending}
          onClick={() =>
            setConsent.mutate({
              semanticSearch: true,
              generative: true,
              translation: consent?.translation ?? false,
            })
          }
        >
          Turn on the assistant
        </Button>
        <Link
          to="/settings"
          className="focus-visible:focus-ring rounded text-sm font-medium text-moss-700 underline underline-offset-4"
        >
          Review AI settings
        </Link>
      </div>
    </section>
  );
}

/** The Assistant page (SRS §20.6, T-102): a conversation that manages the reader's library. */
export function AssistantChatPage() {
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
    <div className="mx-auto flex h-[calc(100dvh-11.5rem)] w-full max-w-3xl flex-col md:h-[calc(100dvh-4rem)]">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-paper-200 pb-4">
        <div>
          <h1 className="font-display text-2xl text-paper-900">Assistant</h1>
          <p className="mt-1 text-sm text-paper-700">Your library, in your own words.</p>
        </div>
        {turns.length > 0 && !consentOff && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            isLoading={reset.isPending}
            aria-label="Clear the conversation"
          >
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} /> Clear
          </Button>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:theme(colors.paper.300)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin]">
        {status.isLoading ? (
          <div className="flex flex-col gap-3 py-10" aria-label="Loading the assistant">
            <div className="h-6 w-64 rounded bg-paper-100 motion-safe:animate-pulse" />
            <div className="h-4 w-96 max-w-full rounded bg-paper-100 motion-safe:animate-pulse" />
          </div>
        ) : status.isError ? (
          <div className="py-8">
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
              <ol className="flex flex-col gap-6 py-6" role="log" aria-live="polite" aria-label="Conversation">
                {turns.map((turn, index) => (
                  <li key={turn.id} className={`flex ${turn.role === 'reader' ? 'justify-end' : 'justify-start'}`}>
                    {turn.role === 'reader' ? (
                      <p className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-md border border-paper-200 bg-paper-100 px-4 py-2.5 text-[15px] leading-relaxed text-paper-900">
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
                    <div className="h-3 w-56 max-w-full rounded-full bg-paper-200 motion-safe:animate-pulse" />
                    <div className="h-3 w-40 rounded-full bg-paper-200 motion-safe:animate-pulse" />
                  </li>
                )}
              </ol>
            )}
          </>
        )}
      </div>

      {!status.isLoading && !status.isError && !consentOff && (
        <form onSubmit={handleSubmit} className="shrink-0 border-t border-paper-200 pt-3">
          <label htmlFor="assistant-message" className="sr-only">
            Message the assistant
          </label>
          <div className="flex items-end gap-2 rounded-xl border border-paper-300 bg-paper-50 p-2 shadow-card transition-colors duration-150 focus-within:border-moss-600">
            <textarea
              id="assistant-message"
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={MAX_LENGTH}
              placeholder="Tell me what you’re reading…"
              className="max-h-42 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed text-paper-900 placeholder:text-paper-600 focus:outline-none"
            />
            <Button
              type="submit"
              aria-label="Send"
              disabled={!draft.trim()}
              isLoading={chat.isPending}
              className="h-10 w-10 !px-0"
            >
              {!chat.isPending && <ArrowUp aria-hidden="true" className="h-4.5 w-4.5" strokeWidth={2} />}
            </Button>
          </div>
          <p className="mt-1.5 hidden px-1 text-xs text-paper-600 sm:block">
            Enter to send, Shift+Enter for a new line. “undo” reverses my last change.
          </p>
        </form>
      )}
    </div>
  );
}
