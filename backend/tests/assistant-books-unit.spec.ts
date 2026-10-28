import { test, expect } from '@playwright/test';
import { mentions, namedTitles, titleScore, matchShelf, mainTitle } from '../src/modules/assistant/domains/books/text/match';
import { toStatus } from '../src/modules/assistant/domains/books/data/status';
import { normalizeSlang, resolveOrdinals } from '../src/modules/assistant/domains/books/conversation/normalize';
import { parseCommands, splitBookList } from '../src/modules/assistant/domains/books/conversation/quickCommands';
import { statedScore, wasAskedFor } from '../src/modules/assistant/domains/books/pipeline/patterns';
import { toStars } from '../src/modules/assistant/domains/books/actions/reviewTools';
import { UNDO_ASK } from '../src/modules/assistant/domains/books/pipeline/undo';
import { tidyReply } from '../src/modules/assistant/domains/books/pipeline/replies';

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

  test('mentions recognises a shortened opening-words reference (R8-03)', () => {
    // "have I rated harry potter?" should resolve to the actual book, not
    // silently fail and fall back to whatever the conversation last discussed.
    expect(mentions('what do you think of harry potter have i rated it', 'Harry Potter and the Chamber of Secrets')).toBe(true);
    expect(namedTitles('have i rated harry potter', ['Harry Potter and the Chamber of Secrets', 'The Fifth Season'])).toEqual([
      'Harry Potter and the Chamber of Secrets',
    ]);
    // Too short/generic an opening shouldn't false-positive on an unrelated title.
    expect(mentions('a good book about potatoes', 'Project Hail Mary')).toBe(false);
  });

  test('mentions recognises a mid-title reference, not just the opening (R8-04)', () => {
    // "did I rate the chamber of secrets book?" names a specific part of
    // the title, not its opening words.
    expect(mentions('did i rate the chamber of secrets book', 'Harry Potter and the Chamber of Secrets')).toBe(true);
    // Short, common words alone ("the", "of") must not false-positive.
    expect(mentions('what is the meaning of life', 'Harry Potter and the Chamber of Secrets')).toBe(false);
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

  test('"reading" after the verb is filler, not part of the title (R5-05)', () => {
    expect(parseCommands('i started reading circe')![0]!.targets[0]!.name).toBe('circe');
    expect(parseCommands('finished reading piranesi')![0]!.targets[0]!.name).toBe('piranesi');
    // A bare "reading" is still itself a verb, as before.
    expect(parseCommands('reading dune')![0]!.targets[0]!.name).toBe('dune');
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
      ['SetStatus', 'Circe'],
    ]);
    expect(parseCommands('rate it 5 stars actually', owned)![0]!.parameters).toEqual([{ type: 'Rating', value: 5 }]);
    expect(parseCommands('and add it to my comfort reads shelf', owned)![0]!.type).toBe('OrganizeShelf');
  });

  test('a typo in an owned title still matches it (R1-04)', () => {
    expect(titleScore('tomorow and tomorrow', 'Tomorrow, and Tomorrow, and Tomorrow')).toBeGreaterThanOrEqual(80);
    expect(titleScore('tomorrow', 'Tomorrow, and Tomorrow, and Tomorrow')).toBeGreaterThanOrEqual(80);
    // R2-03: a title's first word names the book.
    expect(titleScore('klara', 'Klara and the Sun')).toBeGreaterThanOrEqual(80);
    expect(titleScore('klar', 'Klara and the Sun')).toBeLessThan(80);
  });

  test('anything that is not a plain command goes to the model', () => {
    expect(parseCommands('what do you think of dune?')).toBeUndefined();
    expect(parseCommands('I loved that one so much')).toBeUndefined();
  });

  // R2-19: the shelf without the word "shelf", a status that looks like a place, and "it".
  test('shelves named without the word "shelf"', () => {
    const owned = ['Circe', 'Piranesi', 'A Guide to the Galaxy'];
    const shelves = ['Comfort Reads'];
    const shape = (m: string) => parseCommands(m, owned, shelves)?.map((i) => [i.type, i.targets.map((t) => t.name), i.parameters.map((p) => p.value)]);
    expect(shape('put circe on comfort reads')).toEqual([['OrganizeShelf', ['Comfort Reads', 'circe'], []]]);
    expect(shape('add circe to comfort reads')).toEqual([['OrganizeShelf', ['Comfort Reads', 'circe'], []]]);
    expect(shape('add circe to book club')).toEqual([['OrganizeShelf', ['book club', 'circe'], []]]);
    expect(shape('finished circe, 4 stars and put it on comfort reads')).toEqual([
      ['SetStatus', ['circe'], ['FINISHED']],
      ['RateBook', ['circe'], [4]],
      ['OrganizeShelf', ['Comfort Reads', 'it'], []],
    ]);
    expect(shape('put piranesi on hold')).toEqual([['SetStatus', ['piranesi'], ['on hold']]]);
    expect(shape('add a guide to the galaxy')).toEqual([['AddBook', ['a guide to the galaxy'], []]]);
    expect(shape('add dune to my library')).toEqual([['AddBook', ['dune'], []]]);
  });

  test('undo with the words people actually use', () => {
    for (const m of ['undo', 'actually undo that', 'oops, undo', 'ok undo that please']) expect(UNDO_ASK.test(m)).toBe(true);
    expect(UNDO_ASK.test('undo the rating for dune')).toBe(false);
  });

  test('how far they got is not part of the title (R3-07)', () => {
    const owned = ['Klara and the Sun', 'Circe'];
    const target = (m: string) => parseCommands(m, owned)?.[0]?.targets[0]?.name;
    expect(target("gave up on Klara and the Sun around halfway, it just wasn't for me")).toBe('Klara and the Sun');
    expect(target('dnf circe at page 120')).toBe('circe');
    expect(target('gave up on the overstory halfway through')).toBe('the overstory');
  });

  test('adding then setting a status reads as one step, authors with initials too (R3-11)', () => {
    expect(
      tidyReply("I've added The Left Hand of Darkness by Ursula K. Le Guin to your library as Want to Read. I've marked The Left Hand of Darkness as Reading."),
    ).toBe("I've added The Left Hand of Darkness by Ursula K. Le Guin to your library as Reading.");
  });
});

