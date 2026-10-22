import { Lightbulb, MessageCircleQuestion, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';
import { useAiStatus, useAsk, useInsights, useRecommendations } from '../../lib/api/ai';
import { errorMessage } from '../../lib/error-message';
import { AiLabel } from './AiLabel';

const EXAMPLES = ['What did I think about my last finished book?', 'Show me what I saved about courage', 'Which books did I rate highest, and why?'];

function AskSection() {
  const ask = useAsk();
  const [question, setQuestion] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (question.trim()) ask.mutate(question.trim());
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="flex items-center gap-2 font-display text-lg text-paper-900">
        <MessageCircleQuestion aria-hidden="true" className="h-5 w-5 text-moss-600" /> Ask about your reading
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor="ai-question" className="sr-only">
          Your question
        </label>
        <textarea
          id="ai-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={1_000}
          rows={2}
          placeholder={EXAMPLES[0]}
          className="w-full rounded-md border border-paper-300 bg-paper-50 p-2.5 text-sm text-paper-900 focus:border-moss-600 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" isLoading={ask.isPending} disabled={!question.trim()}>
            Ask
          </Button>
          {EXAMPLES.slice(1).map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setQuestion(example)}
              className="focus-visible:focus-ring rounded-full border border-paper-300 px-3 py-1.5 text-xs text-paper-700 hover:border-moss-300"
            >
              {example}
            </button>
          ))}
        </div>
      </form>

      {ask.isError && <ErrorBanner message={errorMessage(ask.error, 'Could not answer that right now.')} />}
      {ask.data && (
        <div className="flex flex-col gap-3 border-t border-paper-200 pt-4" aria-live="polite">
          <AiLabel />
          <p className="whitespace-pre-line text-sm leading-relaxed text-paper-900">{ask.data.answer}</p>
          {!ask.data.coveredByNotes && (
            <p className="text-xs text-paper-600">Your notes don’t fully cover this, so the answer is limited to what they do say.</p>
          )}
          {ask.data.citations.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-paper-700">From your notes</h3>
              <ul className="flex flex-col gap-2">
                {ask.data.citations.map((citation) => (
                  <li key={citation.sourceId} className="rounded-md border border-paper-200 bg-paper-100/60 p-2.5 text-sm">
                    <p className="font-serif italic text-paper-900">“{citation.excerpt}”</p>
                    <Link
                      to={`/library/${citation.workId}`}
                      className="focus-visible:focus-ring mt-1 inline-block rounded text-xs font-medium text-moss-700 underline"
                    >
                      {citation.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function InsightsSection() {
  const insights = useInsights();
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg text-paper-900">
          <Lightbulb aria-hidden="true" className="h-5 w-5 text-moss-600" /> Patterns in your reading
        </h2>
        <Button variant="secondary" size="sm" isLoading={insights.isPending} onClick={() => insights.mutate()}>
          {insights.data ? 'Look again' : 'Find patterns'}
        </Button>
      </div>
      {insights.isError && <ErrorBanner message={errorMessage(insights.error, 'Could not find patterns right now.')} />}
      {insights.data && (
        <>
          <AiLabel />
          <ul className="flex flex-col gap-3">
            {insights.data.insights.map((insight) => (
              <li key={insight.title}>
                <p className="text-sm font-semibold text-paper-900">{insight.title}</p>
                <p className="text-sm text-paper-700">{insight.detail}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function RecommendationsSection() {
  const recommendations = useRecommendations();
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg text-paper-900">
          <Sparkles aria-hidden="true" className="h-5 w-5 text-moss-600" /> What to read next
        </h2>
        <Button variant="secondary" size="sm" isLoading={recommendations.isPending} onClick={() => recommendations.mutate()}>
          {recommendations.data ? 'Suggest others' : 'Suggest books'}
        </Button>
      </div>
      {recommendations.isError && (
        <ErrorBanner message={errorMessage(recommendations.error, 'Could not suggest books right now.')} />
      )}
      {recommendations.data && (
        <>
          <AiLabel />
          <ul className="flex flex-col gap-3">
            {recommendations.data.recommendations.map((pick) => (
              <li key={`${pick.title}-${pick.author}`} className="flex flex-col gap-1">
                <p className="text-sm text-paper-900">
                  <span className="font-semibold">{pick.title}</span> <span className="text-paper-700">by {pick.author}</span>
                </p>
                <p className="text-sm text-paper-700">{pick.reason}</p>
                <Link
                  to={`/library?add=${encodeURIComponent(`${pick.title} ${pick.author}`)}`}
                  className="focus-visible:focus-ring w-fit rounded text-xs font-medium text-moss-700 underline"
                >
                  Find and add this book
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

// SRS §20.1-20.3. Everything here works only from the reader's own data,
// runs only when they ask, and is labelled as an interpretation.
export function AssistantPage() {
  const status = useAiStatus();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-paper-900">Assistant</h1>
        <p className="mt-1 text-sm text-paper-600">Questions, patterns, and suggestions from your own reading.</p>
      </div>

      {status.isLoading && <PageSpinner />}
      {status.isError && <ErrorBanner message={errorMessage(status.error, 'Could not load AI settings.')} />}

      {status.data && !status.data.consent.generative && (
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-sm text-paper-700">
            The assistant uses generated insights, which are off. Turning them on sends excerpts of your own notes to the
            AI provider when you ask something — the details are in Settings.
          </p>
          <Link
            to="/settings"
            className="focus-visible:focus-ring w-fit rounded-md bg-moss-600 px-4 py-2 text-sm font-medium text-paper-50 hover:bg-moss-700"
          >
            Review AI settings
          </Link>
        </Card>
      )}

      {status.data?.consent.generative && !status.data.available.generative && (
        <ErrorBanner message="Generated insights aren’t set up on this server yet." />
      )}

      {status.data?.consent.generative && status.data.available.generative && (
        <>
          <AskSection />
          <InsightsSection />
          <RecommendationsSection />
        </>
      )}
    </div>
  );
}
