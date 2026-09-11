import AdmZip from 'adm-zip';

export interface ChapterSpec {
  id: string;
  label: string;
  body: string;
}

// A minimal, valid, Lorem-ipsum-style EPUB for e2e tests — never real
// copyrighted book text (docs/TESTING_STRATEGY.md §4). Mirrors
// backend/tests/fixtures/generate-sample-epub.ts but lets the caller
// specify chapter labels, since continuity-prompt.spec.ts needs labels
// that deliberately match the SRS §11.9 worked example.
export function generateSampleEpub(chapters: ChapterSpec[]): Buffer {
  const zip = new AdmZip();

  zip.addFile('mimetype', Buffer.from('application/epub+zip'));
  zip.addFile(
    'META-INF/container.xml',
    Buffer.from(
      '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
        '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>' +
        '</container>',
    ),
  );

  const manifestItems = chapters
    .map((c) => `<item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"/>`)
    .join('');
  const spineItems = chapters.map((c) => `<itemref idref="${c.id}"/>`).join('');

  zip.addFile(
    'OEBPS/content.opf',
    Buffer.from(
      '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">' +
        '<metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">E2E Sample Book</dc:title></metadata>' +
        `<manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>${manifestItems}</manifest>` +
        `<spine toc="ncx">${spineItems}</spine>` +
        '</package>',
    ),
  );

  const navPoints = chapters
    .map((c) => `<navPoint id="np-${c.id}"><navLabel><text>${c.label}</text></navLabel><content src="${c.id}.xhtml"/></navPoint>`)
    .join('');
  zip.addFile(
    'OEBPS/toc.ncx',
    Buffer.from(
      `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>${navPoints}</navMap></ncx>`,
    ),
  );

  for (const chapter of chapters) {
    zip.addFile(
      `OEBPS/${chapter.id}.xhtml`,
      Buffer.from(
        `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>${chapter.label}</h1><p>${chapter.body.repeat(20)}</p></body></html>`,
      ),
    );
  }

  return zip.toBuffer();
}

export function defaultChapters(): ChapterSpec[] {
  return [
    { id: 'ch9', label: 'Chapter 9: The Departure', body: 'Lorem ipsum dolor sit amet consectetur adipiscing elit. ' },
    {
      id: 'ch10',
      label: 'Chapter 10: The Reckoning',
      body: 'Ut enim ad minim veniam quis nostrud exercitation ullamco. ',
    },
    { id: 'ch11', label: 'Chapter 11: Aftermath', body: 'Duis aute irure dolor in reprehenderit voluptate velit. ' },
  ];
}
