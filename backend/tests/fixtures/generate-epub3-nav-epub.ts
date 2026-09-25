import AdmZip from 'adm-zip';

// An EPUB3-only book: its table of contents lives in a nav.xhtml
// document (the EPUB3 standard), not the legacy NCX file our own
// hand-rolled parser (epub-indexer.ts, pre-`epub`-library) explicitly
// didn't parse — see that file's old comment: "EPUB3 nav not parsed
// separately for MVP". A book built exactly like this used to come out
// with every chapter labeled by its raw manifest id instead of a real
// chapter title.
export function generateEpub3NavOnlyEpub(): Buffer {
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
      '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">' +
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>EPUB3 Nav Book</dc:title></metadata>' +
        '<manifest>' +
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
        '<item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>' +
        '</manifest>' +
        '<spine><itemref idref="ch1"/><itemref idref="ch2"/></spine>' +
        '</package>',
    ),
  );
  zip.addFile(
    'OEBPS/nav.xhtml',
    Buffer.from(
      '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
        '<body><nav epub:type="toc"><ol>' +
        '<li><a href="chapter1.xhtml">The Beginning</a></li>' +
        '<li><a href="chapter2.xhtml">The End</a></li>' +
        '</ol></nav></body></html>',
    ),
  );
  zip.addFile(
    'OEBPS/chapter1.xhtml',
    Buffer.from(
      `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>The Beginning</h1><p>${'Lorem ipsum dolor sit amet consectetur adipiscing elit. '.repeat(15)}</p></body></html>`,
    ),
  );
  zip.addFile(
    'OEBPS/chapter2.xhtml',
    Buffer.from(
      `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>The End</h1><p>${'Ut enim ad minim veniam quis nostrud exercitation. '.repeat(15)}</p></body></html>`,
    ),
  );

  return zip.toBuffer();
}
