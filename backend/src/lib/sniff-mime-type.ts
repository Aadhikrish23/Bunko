// Content sniffing shared by the files (EPUB/PDF) and images (cover photo)
// upload modules — never trust the client-reported MIME type
// (CODING_STANDARDS.md §4). Each check just confirms the bytes plainly
// are what they claim to be; deeper structural validation happens later,
// per format, where it can degrade gracefully instead of hard-rejecting.
const SIGNATURES: { mimeType: string; matches: (buffer: Buffer) => boolean }[] = [
  {
    mimeType: 'application/epub+zip',
    matches: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
  {
    mimeType: 'application/pdf',
    matches: (b) => b.length >= 5 && b.subarray(0, 5).toString('ascii') === '%PDF-',
  },
  {
    mimeType: 'image/jpeg',
    matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    matches: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mimeType: 'image/webp',
    matches: (b) => b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

export function sniffMimeType(buffer: Buffer): string | null {
  return SIGNATURES.find((signature) => signature.matches(buffer))?.mimeType ?? null;
}
