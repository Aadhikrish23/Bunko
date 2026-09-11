import AdmZip from 'adm-zip';

// A minimal, valid, Lorem-ipsum-style EPUB for tests — never real
// copyrighted book text (docs/TESTING_STRATEGY.md §4).
export function generateSampleEpub(): Buffer {
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
  zip.addFile(
    'OEBPS/content.opf',
    Buffer.from(
      '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">' +
        '<metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Sample Book</dc:title></metadata>' +
        '<manifest>' +
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' +
        '<item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>' +
        '</manifest>' +
        '<spine toc="ncx"><itemref idref="ch1"/><itemref idref="ch2"/></spine>' +
        '</package>',
    ),
  );
  zip.addFile(
    'OEBPS/toc.ncx',
    Buffer.from(
      '<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>' +
        '<navPoint id="np1"><navLabel><text>Chapter One</text></navLabel><content src="chapter1.xhtml"/></navPoint>' +
        '<navPoint id="np2"><navLabel><text>Chapter Two</text></navLabel><content src="chapter2.xhtml"/></navPoint>' +
        '</navMap></ncx>',
    ),
  );
  zip.addFile(
    'OEBPS/chapter1.xhtml',
    Buffer.from(
      `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter One</h1><p>${'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod. '.repeat(20)}</p></body></html>`,
    ),
  );
  zip.addFile(
    'OEBPS/chapter2.xhtml',
    Buffer.from(
      `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter Two</h1><p>${'Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi. '.repeat(20)}</p></body></html>`,
    ),
  );

  return zip.toBuffer();
}
