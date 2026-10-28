import { test, expect } from '@playwright/test';
import { sniffMimeType } from '../src/lib/sniff-mime-type';

test.describe('sniffMimeType (T-024, extended for images in T-108)', () => {
  test('recognises a ZIP/EPUB signature', () => {
    expect(sniffMimeType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe('application/epub+zip');
  });

  test('recognises a PDF signature', () => {
    expect(sniffMimeType(Buffer.from('%PDF-1.7 rest of file', 'ascii'))).toBe('application/pdf');
  });

  test('recognises a JPEG signature', () => {
    expect(sniffMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
  });

  test('recognises a PNG signature', () => {
    expect(sniffMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
  });

  test('recognises a WebP signature (RIFF....WEBP)', () => {
    const buffer = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP', 'ascii')]);
    expect(sniffMimeType(buffer)).toBe('image/webp');
  });

  test('a RIFF file that is not WebP (e.g. a WAV) is not mistaken for an image', () => {
    const buffer = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0, 0, 0, 0]), Buffer.from('WAVE', 'ascii')]);
    expect(sniffMimeType(buffer)).toBeNull();
  });

  test('unrecognised or empty content returns null, never a guess', () => {
    expect(sniffMimeType(Buffer.from('just some text', 'ascii'))).toBeNull();
    expect(sniffMimeType(Buffer.alloc(0))).toBeNull();
  });
});
