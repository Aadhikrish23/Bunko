import { api } from '../api/client';
import type { Annotation, Bookmark, ChaptersResponse } from '../api/types';
import { idbDelete, idbGet, idbGetAll, idbPut } from './idb';

export interface DownloadRecord {
  editionId: string;
  workId: string;
  copyId: string;
  title: string;
  format: 'EPUB' | 'PDF';
  file: Blob;
  sizeBytes: number;
  chapters: ChaptersResponse | null;
  downloadedAt: string;
}

export type DownloadSummary = Omit<DownloadRecord, 'file' | 'chapters'>;

function summarize(record: DownloadRecord): DownloadSummary {
  return {
    editionId: record.editionId,
    workId: record.workId,
    copyId: record.copyId,
    title: record.title,
    format: record.format,
    sizeBytes: record.sizeBytes,
    downloadedAt: record.downloadedAt,
  };
}

interface DownloadManifest {
  fileUrl: string;
  format: 'EPUB' | 'PDF';
  workId: string;
  copyId: string;
  sizeBytes: number;
}

// "Download for offline" (T-073): the reader's own copy only (the
// endpoint enforces that), stored with what the readers need to open it
// with no network — the file, its chapter text, and the current
// annotation/bookmark lists.
export async function downloadEdition(editionId: string, title: string): Promise<DownloadSummary> {
  const manifest = await api.get<DownloadManifest>(`/editions/${editionId}/download`);
  const response = await fetch(manifest.fileUrl);
  if (!response.ok) throw new Error('Could not download the book file.');
  const file = await response.blob();
  const [chapters, annotations, bookmarks] = await Promise.all([
    api.get<ChaptersResponse>(`/editions/${editionId}/chapters`).catch(() => null),
    api.get<Annotation[]>(`/editions/${editionId}/annotations`).catch(() => [] as Annotation[]),
    api.get<Bookmark[]>(`/editions/${editionId}/bookmarks`).catch(() => [] as Bookmark[]),
  ]);

  const record: DownloadRecord = {
    editionId,
    workId: manifest.workId,
    copyId: manifest.copyId,
    title,
    format: manifest.format,
    file,
    sizeBytes: file.size,
    chapters,
    downloadedAt: new Date().toISOString(),
  };
  await idbPut('downloads', record);
  await saveSnapshot(`annotations:${editionId}`, annotations);
  await saveSnapshot(`bookmarks:${editionId}`, bookmarks);

  // Ask the browser not to evict offline books under storage pressure.
  void navigator.storage?.persist?.().catch(() => false);
  return summarize(record);
}

export async function getDownload(editionId: string): Promise<DownloadRecord | undefined> {
  return idbGet<DownloadRecord>('downloads', editionId);
}

export async function listDownloads(): Promise<DownloadSummary[]> {
  const records = await idbGetAll<DownloadRecord>('downloads');
  return records.map(summarize);
}

export async function removeDownload(editionId: string): Promise<void> {
  await idbDelete('downloads', editionId);
  await idbDelete('snapshots', `annotations:${editionId}`);
  await idbDelete('snapshots', `bookmarks:${editionId}`);
}

interface Snapshot<T> {
  key: string;
  value: T;
  savedAt: string;
}

export async function saveSnapshot<T>(key: string, value: T): Promise<void> {
  await idbPut<Snapshot<T>>('snapshots', { key, value, savedAt: new Date().toISOString() });
}

export async function readSnapshot<T>(key: string): Promise<T | undefined> {
  return (await idbGet<Snapshot<T>>('snapshots', key))?.value;
}

// One object URL per downloaded file for the page's lifetime — the
// readers fetch it like any other file URL.
const objectUrls = new Map<string, string>();
export function objectUrlFor(record: DownloadRecord): string {
  let url = objectUrls.get(record.editionId);
  if (!url) {
    url = URL.createObjectURL(record.file);
    objectUrls.set(record.editionId, url);
  }
  return url;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  return estimate?.usage !== undefined && estimate.quota !== undefined
    ? { usage: estimate.usage, quota: estimate.quota }
    : null;
}
