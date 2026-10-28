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
});
