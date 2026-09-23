import { createCanvas } from '@napi-rs/canvas';

function renderTextToJpeg(lines: string[], width: number, height: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'black';
  ctx.font = '24px sans-serif';
  lines.forEach((line, i) => {
    ctx.fillText(line, 30, 50 + i * 36);
  });
  return canvas.toBuffer('image/jpeg', 90);
}

// Assembles a set of numbered PDF objects (string header + optional
// binary stream + string footer) into a complete, valid PDF file —
// shared by both generators below so the xref/trailer bookkeeping
// (the fiddly, easy-to-get-wrong part) is written once.
function assemblePdf(objects: { header: string; binary?: Buffer; footer: string }[], catalogObjNum: number): Buffer {
  let body = Buffer.from('%PDF-1.4\n', 'latin1');
  const offsets: number[] = [0]; // object 0 is the free-list head, never used
  for (const obj of objects) {
    offsets.push(body.length);
    const parts: Buffer[] = [Buffer.from(obj.header, 'latin1')];
    if (obj.binary) parts.push(obj.binary);
    parts.push(Buffer.from(obj.footer, 'latin1'));
    body = Buffer.concat([body, ...parts]);
  }
  const xrefOffset = body.length;
  const totalObjs = objects.length + 1;
  let xref = `xref\n0 ${totalObjs}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${totalObjs} /Root ${catalogObjNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.concat([body, Buffer.from(xref + trailer, 'latin1')]);
}

// A synthetic "scanned page" PDF for OCR tests: an image-only page (a
// JPEG XObject, no text objects/fonts at all) — structurally what a
// real scanned PDF looks like, and what pdf-indexer.ts's hasTextLayer
// check correctly classifies as having no text layer. Never real
// copyrighted book content (docs/TESTING_STRATEGY.md §4).
export function generateScannedPdf(lines: string[]): Buffer {
  const width = 600;
  const height = 300;
  const jpeg = renderTextToJpeg(lines, width, height);
  const contentStream = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;

  const objects = [
    { header: '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', footer: '' },
    { header: '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', footer: '' },
    {
      header: `3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 4 0 R >> >> /MediaBox [0 0 ${width} ${height}] /Contents 5 0 R >>\nendobj\n`,
      footer: '',
    },
    {
      header: `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      binary: jpeg,
      footer: '\nendstream\nendobj\n',
    },
    {
      header: `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}`,
      footer: '\nendstream\nendobj\n',
    },
  ];
  return assemblePdf(objects, 1);
}

// A multi-page scanned PDF *with a bookmark outline* — each chapter is
// one page, referenced by an outline entry with an explicit /Dest, the
// same structure indexPdf()'s outline-based branch parses via
// pdf.js's getOutline()/getDestination(). Exercises the OCR-per-range
// path (extractPageRangeText -> ocrPageText for every page in a
// chapter), not just the no-outline single-page case.
export function generateScannedPdfWithOutline(chapters: { title: string; lines: string[] }[]): Buffer {
  const width = 600;
  const height = 300;
  const n = chapters.length;

  // Object numbering: 1=Catalog, 2=Pages, 3=Outlines root,
  // 4..(3+n)=Page objects, (4+n)..(3+2n)=Image XObjects,
  // (4+2n)..(3+3n)=Content streams, (4+3n)..(3+4n)=Outline items.
  const pageObjNum = (i: number) => 4 + i;
  const imageObjNum = (i: number) => 4 + n + i;
  const contentObjNum = (i: number) => 4 + 2 * n + i;
  const outlineObjNum = (i: number) => 4 + 3 * n + i;

  const objects: { header: string; binary?: Buffer; footer: string }[] = [];
  // Placeholder pushes below are appended in object-number order (1, 2, 3, then 4..).
  objects.push({ header: `1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Outlines 3 0 R >>\nendobj\n`, footer: '' });
  const kids = Array.from({ length: n }, (_, i) => `${pageObjNum(i)} 0 R`).join(' ');
  objects.push({ header: `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`, footer: '' });
  objects.push({
    header: `3 0 obj\n<< /Type /Outlines /First ${outlineObjNum(0)} 0 R /Last ${outlineObjNum(n - 1)} 0 R /Count ${n} >>\nendobj\n`,
    footer: '',
  });

  for (let i = 0; i < n; i += 1) {
    objects.push({
      header:
        `${pageObjNum(i)} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 ${imageObjNum(i)} 0 R >> >> ` +
        `/MediaBox [0 0 ${width} ${height}] /Contents ${contentObjNum(i)} 0 R >>\nendobj\n`,
      footer: '',
    });
  }
  for (let i = 0; i < n; i += 1) {
    const jpeg = renderTextToJpeg(chapters[i]!.lines, width, height);
    objects.push({
      header: `${imageObjNum(i)} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      binary: jpeg,
      footer: '\nendstream\nendobj\n',
    });
  }
  for (let i = 0; i < n; i += 1) {
    const contentStream = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    objects.push({
      header: `${contentObjNum(i)} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}`,
      footer: '\nendstream\nendobj\n',
    });
  }
  for (let i = 0; i < n; i += 1) {
    const prev = i > 0 ? ` /Prev ${outlineObjNum(i - 1)} 0 R` : '';
    const next = i < n - 1 ? ` /Next ${outlineObjNum(i + 1)} 0 R` : '';
    const title = chapters[i]!.title.replace(/[()\\]/g, '');
    objects.push({
      header:
        `${outlineObjNum(i)} 0 obj\n<< /Title (${title}) /Parent 3 0 R${prev}${next} ` +
        `/Dest [${pageObjNum(i)} 0 R /Fit] >>\nendobj\n`,
      footer: '',
    });
  }

  return assemblePdf(objects, 1);
}
