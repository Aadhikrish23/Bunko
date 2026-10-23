import { test, expect } from '@playwright/test';
import { cleanSynopsis } from './synopsis';

const story = 'This is the way the world ends, for the last time. A season of endings has begun, and it starts with the great red rift.';

test.describe('cleanSynopsis (R2-27)', () => {
  test('drops a press quote, its attribution and an award line', () => {
    const raw = `"Intricate and extraordinary." - New York Times on The Fifth Season (A New York Times Notable Book of 2015) WINNER OF THE HUGO AWARD FOR BEST NOVEL 2016 ${story}`;
    expect(cleanSynopsis(raw)).toBe(story);
  });

  test('drops a bestseller banner', () => {
    expect(cleanSynopsis(`NEW YORK TIMES BESTSELLER • ${story}`)).toBe(story);
    expect(cleanSynopsis(`THE EMOTIONAL NEW NOVEL FROM THE BESTSELLING AUTHOR In Tokyo, there is a street of bookshops where every reader eventually ends up, one way or another.`)).toBe(
      'In Tokyo, there is a street of bookshops where every reader eventually ends up, one way or another.',
    );
  });

  test('leaves ordinary descriptions, and ones that are a quotation, alone', () => {
    expect(cleanSynopsis(story)).toBe(story);
    const quoted = '"கல்கி கிருஷ்ணமூர்த்தி அவர்களின் புகழ் பெற்ற வரலாற்று நாவல்களுள் ஒன்று பார்த்திபன் கனவு." இந்த நாவல் சோழர்கள் காலத்தில் நடந்ததாக எழுதப்பட்டது.';
    expect(cleanSynopsis(quoted)).toBe(quoted);
    expect(cleanSynopsis('I AM NOT A MONSTER. I was born in the north and raised by wolves, as it happens, and nobody ever believed me.')).toBe(
      'I AM NOT A MONSTER. I was born in the north and raised by wolves, as it happens, and nobody ever believed me.',
    );
  });

  test('markdown emphasis is shown as plain text (R3-05)', () => {
    const raw = `**From the *New York Times* bestselling author of *Jonathan Strange & Mr. Norrell*, an intoxicating, hypnotic novel.** ${story}`;
    expect(cleanSynopsis(raw)).toBe(`From the New York Times bestselling author of Jonathan Strange & Mr. Norrell, an intoxicating, hypnotic novel. ${story}`);
    expect(cleanSynopsis(`${story} 2 * 3 * 4 stays maths.`)).toBe(`${story} 2 * 3 * 4 stays maths.`);
  });
});
