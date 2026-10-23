import AdmZip from 'adm-zip';

/**
 * "The Lantern Keeper of Aldmere": a short ORIGINAL novella written for Bunko's QA rounds (T-105),
 * so testers can read, highlight and bookmark a real-feeling book. No third-party text.
 */
const TITLE = 'The Lantern Keeper of Aldmere';
const AUTHOR = 'Bunko Sample Press';

const CHAPTERS: { title: string; paragraphs: string[] }[] = [
  {
    title: 'The Last Lantern',
    paragraphs: [
      'Aldmere had forty-one lanterns, and every one of them was Wren Halloway’s to light. She began at the harbour wall when the tide turned and finished at the chapel steps when the bells forgot what hour it was.',
      'The work was older than the town’s maps. Her grandmother had done it, and her grandmother’s uncle before that, and somewhere further back a man whose name survived only as a carving on the oil store door: H., who never missed a night.',
      'Wren had not missed one either, not in eleven years. So when she reached the forty-first lantern, the one on the crooked post by the abandoned customs house, and found it already lit, she stood very still and listened to the sea.',
      'The flame was the wrong colour. Lantern oil burned amber; this burned the pale green of a winter sky just before the sun gives up. It made no smoke and threw no heat, and when she held her palm to the glass it was cold as a well bucket.',
    ],
  },
  {
    title: 'A Ledger in Salt',
    paragraphs: [
      'The oil store kept the keepers’ ledger, a fat book swollen with damp, its pages ruled in a hand that changed every forty years or so. Wren read it by her own lamp until the candle guttered.',
      'Most entries were dull in the way true things often are. Wick trimmed. Glass cracked on the ninth, replaced. Gull nest removed from the harbour lantern, again. But in the spring of a year nobody alive remembered, H. had written a line and then scored it out so hard the nib had torn the paper.',
      'Held to the light, the tear still showed the shape of the words. The forty-second lantern is not ours to light.',
      'Aldmere had never had a forty-second lantern. Wren counted them twice on the map pinned above the ledger, then once more on her fingers, the way a child counts stars, and came to forty-one each time.',
    ],
  },
  {
    title: 'The Customs House',
    paragraphs: [
      'The customs house had been shut since the harbour silted and the tall ships stopped coming. Its door was swollen into its frame, but the side window gave when she leaned on it, and she climbed in onto a floor gritty with sand that had found its way in over decades.',
      'Inside, the rooms were arranged as if their clerks had only stepped out: inkwells dried to black crusts, a coat on a hook gone soft as moss, a calendar showing a month that no longer meant anything. On the long desk lay a lantern, unlit, made of the same green glass as the flame outside.',
      'Beside it was a note in a hand she knew from the ledger. If you have found this, the light has chosen you, as it once chose me. It does not ask much. Only that you remember where the ships used to come in.',
      'Wren did not believe in lights that chose people. She believed in wicks and oil and the patience to do a small thing every night. But she picked up the green lantern anyway, and it was warm.',
    ],
  },
  {
    title: 'What the Tide Remembers',
    paragraphs: [
      'She carried it to the end of the silted harbour, where the old channel had been, and set it on the last stone that still stood above the mud. Nothing happened, which was a relief, and then something did, which was not.',
      'Out on the flats the water came back. Not the real tide, which was hours off, but a thinner, brighter water that lay on the mud like a memory of itself. On it, pale as paper, came the shapes of ships: tall ones, with sails that did not move in the wind because there was no wind where they were.',
      'They did not land. They only passed, one after another, close enough that she could see figures on their decks raising their hands, and she understood that this was what the forty-second lantern was for. Not to guide anyone in. To let them know the harbour had not forgotten them.',
      'She raised her hand back. It felt foolish and then it did not.',
    ],
  },
  {
    title: 'Forty-Two',
    paragraphs: [
      'By morning the flats were mud again and the green lantern was cold. Wren carried it home, cleaned the glass, and wrote in the ledger in her plain, careful hand.',
      'Forty-one lanterns lit. Glass at the chapel steps cleaned. One more lantern, kept in the customs house, lit on nights when the sea is quiet. Not ours, but kept.',
      'She did not score it out. The next keeper, whoever they turned out to be, deserved to know which lights were for the living and which were for remembering, and that both kinds needed tending.',
      'That evening she began, as always, at the harbour wall. The tide was turning. Somewhere behind her, very faintly, a light the colour of a winter sky waited its turn.',
    ],
  },
];

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function generateQaSampleBook(): { title: string; author: string; epub: Buffer } {
  const zip = new AdmZip();
  zip.addFile('mimetype', Buffer.from('application/epub+zip'));
  zip.addFile(
    'META-INF/container.xml',
    Buffer.from(
      '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
        '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
  );
  const ids = CHAPTERS.map((_, i) => `ch${i + 1}`);
  zip.addFile(
    'OEBPS/content.opf',
    Buffer.from(
      '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">' +
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        `<dc:title>${escape(TITLE)}</dc:title><dc:creator>${escape(AUTHOR)}</dc:creator><dc:language>en</dc:language>` +
        '<dc:identifier id="bookid">bunko-qa-lantern-keeper</dc:identifier></metadata><manifest>' +
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' +
        ids.map((id) => `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`).join('') +
        '</manifest><spine toc="ncx">' +
        ids.map((id) => `<itemref idref="${id}"/>`).join('') +
        '</spine></package>',
    ),
  );
  zip.addFile(
    'OEBPS/toc.ncx',
    Buffer.from(
      '<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>' +
        CHAPTERS.map(
          (c, i) =>
            `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${escape(c.title)}</text></navLabel><content src="${ids[i]}.xhtml"/></navPoint>`,
        ).join('') +
        '</navMap></ncx>',
    ),
  );
  CHAPTERS.forEach((chapter, i) => {
    zip.addFile(
      `OEBPS/${ids[i]}.xhtml`,
      Buffer.from(
        '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head>' +
          `<title>${escape(chapter.title)}</title></head><body><h1>${escape(chapter.title)}</h1>` +
          chapter.paragraphs.map((p) => `<p>${escape(p)}</p>`).join('') +
          '</body></html>',
      ),
    );
  });
  return { title: TITLE, author: AUTHOR, epub: zip.toBuffer() };
}
