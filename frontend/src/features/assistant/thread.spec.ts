import { test, expect } from '@playwright/test';
import { capTurns, markTitles, retireChoices, toBlocks, turnFromReply, type Turn } from './thread';

test.describe('assistant thread (T-102)', () => {
  test('a reply splits into paragraphs and lists, in order', () => {
    expect(toBlocks("From your Want to Read list:\n- Piranesi: you loved Circe.\n- Dune\n\nSay the word.")).toEqual([
      { kind: 'p', text: 'From your Want to Read list:' },
      { kind: 'list', items: ['Piranesi: you loved Circe.', 'Dune'] },
      { kind: 'p', text: 'Say the word.' },
    ]);
  });

  test('library titles are found in a reply, longest first, whole words only', () => {
    const runs = markTitles("I've moved Dune Messiah next to Dune. Dunes aside.", ['Dune', 'Dune Messiah']);
    expect(runs.filter((r) => r.title).map((r) => r.text)).toEqual(['Dune Messiah', 'Dune']);
    expect(runs.map((r) => r.text).join('')).toBe("I've moved Dune Messiah next to Dune. Dunes aside.");
  });

  test('titles in any script are found', () => {
    const runs = markTitles('நீங்கள் பொன்னியின் செல்வன் படிக்கிறீர்கள்', ['பொன்னியின் செல்வன்']);
    expect(runs.find((r) => r.title)?.text).toBe('பொன்னியின் செல்வன்');
  });

  test('a removal confirmation becomes a danger choice and a keep choice', () => {
    const turn = turnFromReply('1', {
      success: false,
      status: 'CONFIRMATION_REQUIRED',
      message: 'Remove Dune from your library?',
      clarificationRequest: { reason: 'Notes stay.', candidates: [{ id: 'y', label: 'Yes, remove it' }, { id: 'n', label: 'No, keep it' }] },
    });
    expect(turn.role === 'assistant' && turn.choices).toEqual([
      { label: 'Yes, remove it', tone: 'danger' },
      { label: 'No, keep it', tone: 'neutral' },
    ]);
    expect(turn.role === 'assistant' && turn.reason).toBe('Notes stay.');
  });

  test('choices retire once the conversation moves on', () => {
    const turns: Turn[] = [{ id: '1', role: 'assistant', text: 'Which one?', status: 'CLARIFICATION_REQUIRED', choices: [{ label: 'Dune', tone: 'neutral' }] }];
    expect(retireChoices(turns)[0]).toEqual({ id: '1', role: 'assistant', text: 'Which one?', status: 'CLARIFICATION_REQUIRED', choices: undefined, retry: undefined });
  });

  test('the kept thread is capped', () => {
    const many: Turn[] = Array.from({ length: 80 }, (_, i) => ({ id: String(i), role: 'reader', text: `m${i}` }));
    const capped = capTurns(many);
    expect(capped).toHaveLength(60);
    expect(capped[0]?.id).toBe('20');
  });
});
