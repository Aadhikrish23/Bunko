import { test, expect } from '@playwright/test';
import { normalizePlan } from '../src/modules/assistant/domains/books/pipeline/planChecks';
import { IntentTargetType } from '../src/modules/assistant/intent/IntentTargetType';
import type { IntentPlan } from '../src/modules/assistant/intent/IntentPlan';

// Pure: no server or database needed.
test.describe('normalizePlan (R7-01, R8-01)', () => {
  function planWithShelfName(name: string): IntentPlan {
    return {
      id: 'test-plan',
      requestId: 'test-request',
      intents: [
        {
          type: 'OrganizeShelf',
          confidence: 1,
          targets: [{ type: IntentTargetType.Collection, name }, { type: IntentTargetType.Book, name: 'Circe' }],
          parameters: [],
        },
      ],
    };
  }

  test('strips "a shelf called X" down to just X', () => {
    const plan = planWithShelfName('Shelf Called Favorites');
    normalizePlan(plan);
    expect(plan.intents[0]!.targets![0]!.name).toBe('Favorites');
  });

  test('strips "the collection named X" down to just X', () => {
    const plan = planWithShelfName('the collection named Cozy Reads');
    normalizePlan(plan);
    expect(plan.intents[0]!.targets![0]!.name).toBe('Cozy Reads');
  });

  test('strips "a new shelf called X" down to just X (R8-01)', () => {
    const plan = planWithShelfName('New Shelf Called Epic Fantasy');
    normalizePlan(plan);
    expect(plan.intents[0]!.targets![0]!.name).toBe('Epic Fantasy');
  });

  test('strips "a custom shelf called X" down to just X', () => {
    const plan = planWithShelfName('a custom shelf called Spooky Season Reads');
    normalizePlan(plan);
    expect(plan.intents[0]!.targets![0]!.name).toBe('Spooky Season Reads');
  });

  test('leaves an already-clean shelf name untouched', () => {
    const plan = planWithShelfName('Comfort Reads');
    normalizePlan(plan);
    expect(plan.intents[0]!.targets![0]!.name).toBe('Comfort Reads');
  });

  test('never produces an empty name', () => {
    const plan = planWithShelfName('shelf called');
    normalizePlan(plan);
    expect(plan.intents[0]!.targets![0]!.name).toBe('shelf called');
  });

  test('a shelf name the reader chose that itself contains "shelf" is left untouched', () => {
    const plan = planWithShelfName('Alpha Shelf');
    normalizePlan(plan);
    expect(plan.intents[0]!.targets![0]!.name).toBe('Alpha Shelf');
  });
});

test.describe('normalizePlan: restores a shelf name truncated by the model, from the message itself (R10-03)', () => {
  function planWithShelfName(name: string): IntentPlan {
    return {
      id: 'test-plan',
      requestId: 'test-request',
      intents: [
        {
          type: 'OrganizeShelf',
          confidence: 1,
          targets: [{ type: IntentTargetType.Collection, name }, { type: IntentTargetType.Book, name: 'Circe' }],
          parameters: [],
        },
      ],
    };
  }

  test('restores "Alpha" back to "Alpha Shelf" when the message said "called alpha shelf"', () => {
    const plan = planWithShelfName('Alpha');
    normalizePlan(plan, 'put circe on a shelf called alpha shelf');
    expect(plan.intents[0]!.targets![0]!.name).toBe('Alpha Shelf');
  });

  test('restores across an "and" boundary too', () => {
    const plan = planWithShelfName('Gamma');
    normalizePlan(plan, 'make a shelf called gamma shelf and add circe to it');
    expect(plan.intents[0]!.targets![0]!.name).toBe('Gamma Shelf');
  });

  test('does not touch an already-correct name', () => {
    const plan = planWithShelfName('Alpha Shelf');
    normalizePlan(plan, 'put circe on a shelf called alpha shelf');
    expect(plan.intents[0]!.targets![0]!.name).toBe('Alpha Shelf');
  });

  test('does not touch an unrelated, intentionally different shelf elsewhere in the message', () => {
    const plan = planWithShelfName('Sci-fi');
    normalizePlan(plan, 'take dune off the sci-fi shelf and put circe on a shelf called favorites');
    expect(plan.intents[0]!.targets![0]!.name).toBe('Sci-fi');
  });

  test('does nothing when no message is given (backward compatible)', () => {
    const plan = planWithShelfName('Alpha');
    normalizePlan(plan);
    expect(plan.intents[0]!.targets![0]!.name).toBe('Alpha');
  });
});

test.describe('normalizePlan: book-name trailer cleanup (R10-01)', () => {
  function planWithBookName(name: string): IntentPlan {
    return {
      id: 'test-plan',
      requestId: 'test-request',
      intents: [
        {
          type: 'OrganizeShelf',
          confidence: 1,
          targets: [{ type: IntentTargetType.Collection, name: 'Gamma Shelf' }, { type: IntentTargetType.Book, name }],
          parameters: [],
        },
      ],
    };
  }

  test('strips a trailing " to it" that leaked from the connecting phrase', () => {
    const plan = planWithBookName('Klara and the Sun to it');
    normalizePlan(plan);
    const bookTarget = plan.intents[0]!.targets!.find((t) => t.type === IntentTargetType.Book)!;
    expect(bookTarget.name).toBe('Klara and the Sun');
  });

  test('strips wrapping quotes the model added while trying to disambiguate', () => {
    const plan = planWithBookName('"Klara and the Sun" to it');
    normalizePlan(plan);
    const bookTarget = plan.intents[0]!.targets!.find((t) => t.type === IntentTargetType.Book)!;
    expect(bookTarget.name).toBe('Klara and the Sun');
  });

  test('leaves a clean book name untouched', () => {
    const plan = planWithBookName('Piranesi');
    normalizePlan(plan);
    const bookTarget = plan.intents[0]!.targets!.find((t) => t.type === IntentTargetType.Book)!;
    expect(bookTarget.name).toBe('Piranesi');
  });
});

test.describe('normalizePlan: create-and-organize targets the same shelf (R9-01)', () => {
  function plan(organizeShelfName: string): IntentPlan {
    return {
      id: 'test-plan',
      requestId: 'test-request',
      intents: [
        { type: 'CreateShelf', confidence: 1, targets: [{ type: IntentTargetType.Collection, name: 'Test Shelf Two' }], parameters: [] },
        {
          type: 'OrganizeShelf',
          confidence: 1,
          targets: [{ type: IntentTargetType.Collection, name: organizeShelfName }, { type: IntentTargetType.Book, name: 'Piranesi' }],
          parameters: [],
        },
      ],
    };
  }

  test('a single create + organize in one plan always targets the shelf just created', () => {
    const p = plan('Test Shelf One'); // an older shelf the model pointed at by mistake
    normalizePlan(p);
    const organizeTarget = p.intents[1]!.targets!.find((t) => t.type === IntentTargetType.Collection)!;
    expect(organizeTarget.name).toBe('Test Shelf Two');
  });

  test('leaves it alone when the organize target already matches the created shelf', () => {
    const p = plan('Test Shelf Two');
    normalizePlan(p);
    const organizeTarget = p.intents[1]!.targets!.find((t) => t.type === IntentTargetType.Collection)!;
    expect(organizeTarget.name).toBe('Test Shelf Two');
  });

  test('does not touch an OrganizeShelf when there is more than one in the plan (ambiguous)', () => {
    const p = plan('Test Shelf One');
    p.intents.push({
      type: 'OrganizeShelf',
      confidence: 1,
      targets: [{ type: IntentTargetType.Collection, name: 'Sci-fi' }, { type: IntentTargetType.Book, name: 'Dune' }],
      parameters: [],
    });
    normalizePlan(p);
    const firstOrganize = p.intents[1]!.targets!.find((t) => t.type === IntentTargetType.Collection)!;
    expect(firstOrganize.name).toBe('Test Shelf One');
  });
});
