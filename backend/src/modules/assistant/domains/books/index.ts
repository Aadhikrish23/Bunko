import type { DomainPack } from '../../domain/DomainPack';
import { BookIntent } from './intent/BookIntent';
import { bookTools } from './execution/bookTools';
import { createToolRegistry, registerCapabilities } from './registry';
import { registerContextProviders } from './context/providers';
import { resolveBook } from './entity/BookResolver';
import { normalizeSlang, resolveOrdinals, withPageBook } from './conversation/normalize';
import { preRoute } from './pipeline/preRoute';
import { correctPlan, groundPlan, lastNamedTitle, normalizePlan, shapePlan } from './pipeline/planChecks';
import { askBeforeRemoving, followUpOffer, tidyReply } from './pipeline/replies';
import { forgetChange, hasUntrackedChanges, rememberChange, snapshotBefore, type Snapshot } from './pipeline/undo';
import { CLAIMS_ACTION, CORRECTION, KEEP_MODEL_REPLY, LOOKS_LIKE_QUESTION } from './pipeline/patterns';
import { describeResults } from './response/describeResults';
import { buildPlanPrompt } from './prompts/planPrompt';
import { buildAnswerPrompt } from './prompts/answerPrompt';
import { snapshotTitles } from './data/library';

/** Bunko's world for the assistant (SRS §20.6): the reader's books, statuses, ratings, notes and shelves. */
export const booksPack: DomainPack = {
  id: 'books',
  intentTypes: Object.values(BookIntent),
  tools: bookTools,

  createToolRegistry,
  registerCapabilities,
  registerContextProviders,
  resolveEntity: (userId, query, options) => resolveBook(userId, query, options),

  // Typos and slang first; then "the second one" right after a list names that book.
  normalizeMessage: (message, lastExchange) => resolveOrdinals(normalizeSlang(message), lastExchange),
  withPageContext: withPageBook,
  preRoute,
  correctPlan: (plan, { message }) => correctPlan(plan, message),
  normalizePlan,
  groundPlan: (plan, { userId, message, requestContext, lastExchange, session }) =>
    groundPlan(plan, {
      userId,
      message,
      lastExchange,
      // "it" = the book the assistant just talked about, before an older session reference.
      currentTitle:
        lastNamedTitle(lastExchange?.assistant ?? '', snapshotTitles(requestContext?.library)) ?? session.references.currentBook?.displayName ?? null,
      pageTitle: requestContext?.page?.bookTitle ?? null,
    }),
  shapePlan,
  // "add Circe and mark it reading": the book has to exist before the next step can find it.
  runsFirst: (intentType) => intentType === BookIntent.AddBook,

  undo: {
    snapshotBefore,
    remember: (userId, snapshot) => rememberChange(userId, snapshot as Snapshot),
    forget: forgetChange,
    hasUntrackedChanges,
  },
  followUpOffer,
  confirmBeforeRunning: askBeforeRemoving,
  finishReply: (_userId, _requestId, message) => tidyReply(message),
  describeResults,

  prompts: {
    plan: buildPlanPrompt,
    answer: buildAnswerPrompt,
  },
  async prepareQuestion(question, context) {
    return { question: withPageBook(question, context.page?.bookTitle), context };
  },

  phrases: {
    correction: CORRECTION,
    keepModelReply: KEEP_MODEL_REPLY,
    looksLikeQuestion: LOOKS_LIKE_QUESTION,
    claimsAction: CLAIMS_ACTION,
    notSureWhatToChange: "I'm not sure what you'd like me to change, so I left everything as it is. Could you say it another way?",
    notSureWhich: "I'm not sure which book you mean, so I didn't change anything. Tell me the title and I'll do it.",
    missing: (names) =>
      `${names.map((n) => `"${n}"`).join(' and ')} ${names.length === 1 ? "isn't" : "aren't"} in your library, so I skipped that. Say "add ${names[0]}" first if you'd like it.`,
    ungrounded: "I wasn't sure which book you meant for part of that, so I left it. Tell me the title and I'll do it.",
    keptReview: 'I kept the review you\'d already written; say "change my review of ... to ..." if you want to replace it.',
    claimsActionReply: "I didn't change anything with that message. Tell me what you'd like done, like \"add Piranesi\" or \"rate Dune 4\", and I'll do it.",
    greetings: {
      hello: 'Hi! I can add books, update what you\'re reading, rate and review, take notes, and sort your shelves. What would you like to do?',
      thanks: "You're welcome! Anything else for your shelves?",
      howAreYou: "I'm good, thanks! Ready when you are: add a book, log what you finished, or ask what to read next.",
      capabilities:
        'I can manage your library in plain words: add or remove books ("add Piranesi"), set what you\'re reading or finished ("finished Circe"), rate and review ("rate Dune 4, loved the worldbuilding"), add notes, create shelves and move books onto them, answer questions about your library ("what\'s on my want to read list?"), suggest what to read next, and undo my last change.',
    },
  },
};

export default booksPack;
