import { test, expect } from '@playwright/test';
import { mentions, namedTitles, titleScore, matchShelf, mainTitle } from '../src/modules/assistant/domains/books/text/match';
import { toStatus } from '../src/modules/assistant/domains/books/data/status';
import { normalizeSlang, resolveOrdinals } from '../src/modules/assistant/domains/books/conversation/normalize';
import { parseCommands, splitBookList } from '../src/modules/assistant/domains/books/conversation/quickCommands';
import { statedScore, wasAskedFor } from '../src/modules/assistant/domains/books/pipeline/patterns';
import { toStars } from '../src/modules/assistant/domains/books/actions/reviewTools';

// T-103: the books pack's pure pieces. No server or database.

test.describe('title matching', () => {
  test('exact, subtitle-free, word subset, and typos all match', () => {
    expect(titleScore('Project Hail Mary', 'Project Hail Mary: A Novel')).toBeGreaterThanOrEqual(97);
    expect(titleScore('hail mary', 'Project Hail Mary')).toBeGreaterThanOrEqual(80);
    expect(titleScore('projcet hail mary', 'Project Hail Mary')).toBeGreaterThanOrEqual(80);
    expect(titleScore('the hobbit', 'Hobbit')).toBeGreaterThanOrEqual(97);
    expect(titleScore('dune', 'Circe')).toBeLessThan(75);
  });

  test('works for titles outside the Latin alphabet', () => {
    expect(titleScore('பொன்னியின் செல்வன்', 'பொன்னியின் செல்வன்')).toBe(100);
    expect(titleScore('ノルウェイの森', 'ノルウェイの森 上')).toBeGreaterThanOrEqual(70);
  });

  test('mentions finds titles inside a message, misspelt or not', () => {
    expect(mentions('just finished projetc hail mary last night', 'Project Hail Mary')).toBe(true);
    expect(mentions('rate it 4', 'It')).toBe(false);
    expect(namedTitles('loved dune messiah more than dune', ['Dune', 'Dune Messiah'])).toEqual(['Dune Messiah', 'Dune']);
  });

  test('mainTitle drops subtitles and series markers', () => {
    expect(mainTitle('Dune (Dune Chronicles #1)')).toBe('Dune');
    expect(mainTitle('Sapiens: A Brief History of Humankind')).toBe('Sapiens');
  });

  test('shelf names match without the word "shelf" or exact spelling', () => {
    const shelves = [{ name: 'Sci-Fi' }, { name: 'Comfort Reads' }];
    expect(matchShelf('scifi shelf', shelves)?.name).toBe('Sci-Fi');
    expect(matchShelf('comfort read', shelves)?.name).toBe('Comfort Reads');
    expect(matchShelf('horror', shelves)).toBeUndefined();
  });
});

test.describe('reader words', () => {
  test('statuses from slang', () => {
    expect(toStatus('TBR')).toBe('WANT_TO_READ');
    expect(toStatus("DNF'd")).toBe('DID_NOT_FINISH');
    expect(toStatus('gave up')).toBe('DID_NOT_FINISH');
    expect(toStatus('finished')).toBe('FINISHED');
    expect(toStatus('currently reading')).toBe('READING');
    expect(toStatus('paused')).toBeUndefined();
  });

  test('typos and shorthand are fixed before anything reads the message', () => {
    expect(normalizeSlang('finsihed dune, add it to my tbr pls')).toBe('finished dune, add it to my want to read list please');
  });

  test('"the second one" after a list names that book', () => {
    const last = { user: 'what next?', assistant: "I'd start with:\n- Piranesi by Susanna Clarke: you loved it.\n- Circe: waiting." };
    expect(resolveOrdinals('add the second one to my shelf', last)).toBe('add Circe to my shelf');
  });

  test('scores and whole stars', () => {
    expect(statedScore('finished it, 9/10')).toEqual({ value: 9, scale: 10 });
    expect(statedScore('five stars')).toEqual({ value: 5, scale: 5 });
    expect(toStars(4)).toBe(4);
    expect(toStars(8, 10)).toBe(4);
    expect(toStars(4.5)).toBeUndefined();
    expect(toStars(9)).toBeUndefined(); // 9/10 = 4.5 stars: asked, not rounded
  });

  test('changes are only made when the message asks for them', () => {
    expect(wasAskedFor('RemoveBook', 'gave up on dune')).toBe(false);
    expect(wasAskedFor('RemoveBook', 'remove dune from my library')).toBe(true);
    expect(wasAskedFor('SetStatus', 'add a note to dune: the spice')).toBe(false);
  });
});

test.describe('plain commands', () => {
  test('one clause each, in order', () => {
    const intents = parseCommands('started piranesi and rate dune 4')!;
    expect(intents.map((i) => i.type)).toEqual(['SetStatus', 'RateBook']);
  });

  test('book lists split into owned books only, never inside a title', () => {
    expect(splitBookList('dune and circe', ['Dune', 'Circe'])).toEqual(['dune', 'circe']);
    // Not known books: "and" may belong to a title, so it stays whole for the model.
    expect(splitBookList('dune and circe')).toEqual(['dune and circe']);
    expect(splitBookList('dune, pride and prejudice and circe', ['Pride and Prejudice', 'Dune', 'Circe'])).toEqual(['dune', 'pride and prejudice', 'circe']);
    expect(splitBookList('pride and prejudice', ['Pride and Prejudice'])).toEqual(['pride and prejudice']);
  });

  test('a status with a score keeps the comment as the review; a comma ends the title', () => {
    const [status, rate] = parseCommands('finished piranesi, 5 stars, the house was unforgettable')!;
    expect(status!.targets[0]!.name).toBe('piranesi');
    expect(rate!.parameters).toEqual([
      { type: 'Rating', value: 5 },
      { type: 'Text', value: 'the house was unforgettable' },
    ]);
    expect(parseCommands('finished circe, loved it')![0]!.targets[0]!.name).toBe('circe');
  });

  test('titles with commas survive clause splitting; filler words are ignored (R1-03)', () => {
    const owned = ['Tomorrow, and Tomorrow, and Tomorrow', 'Circe'];
    const [started] = parseCommands('I started Tomorrow, and Tomorrow, and Tomorrow', owned)!;
    expect(started!.targets[0]!.name).toBe('Tomorrow, and Tomorrow, and Tomorrow');
    const two = parseCommands("ok i started tomorrow and tomorrow and tomorrow. and dnf circe tbh, couldnt get into it", owned)!;
    expect(two.map((i) => [i.type, i.targets[0]!.name])).toEqual([
      ['SetStatus', 'Tomorrow, and Tomorrow, and Tomorrow'],
      ['SetStatus', 'circe'],
    ]);
    expect(parseCommands('rate it 5 stars actually', owned)![0]!.parameters).toEqual([{ type: 'Rating', value: 5 }]);
    expect(parseCommands('and add it to my comfort reads shelf', owned)![0]!.type).toBe('OrganizeShelf');
  });

  test('a typo in an owned title still matches it (R1-04)', () => {
    expect(titleScore('tomorow and tomorrow', 'Tomorrow, and Tomorrow, and Tomorrow')).toBeGreaterThanOrEqual(80);
    expect(titleScore('tomorrow', 'Tomorrow, and Tomorrow, and Tomorrow')).toBeGreaterThanOrEqual(80);
  });

  test('anything that is not a plain command goes to the model', () => {
    expect(parseCommands('what do you think of dune?')).toBeUndefined();
    expect(parseCommands('I loved that one so much')).toBeUndefined();
  });
});
