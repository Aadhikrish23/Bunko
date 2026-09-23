import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { useMetadataSearch } from '../../lib/api/metadata';
import type { MetadataCandidate } from '../../lib/api/types';
import { useCreateWork } from '../../lib/api/works';
import { errorMessage } from '../../lib/error-message';
import { BookCover } from './BookCover';

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

const LANGUAGES = [
  { code: 'all', label: 'All Languages' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ta', label: 'Tamil' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
];

export function AddBookDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (workId: string) => void }) {
  const [query, setQuery] = useState('');
  const [selectedLang, setSelectedLang] = useState('all');
  const [selectedCandidate, setSelectedCandidate] = useState<MetadataCandidate | null>(null);
  const [manualTitle, setManualTitle] = useState('');
  const [manualAuthor, setManualAuthor] = useState('');
  const [manualOriginalLang, setManualOriginalLang] = useState('English');
  const [manualReadingLang, setManualReadingLang] = useState('English');
  const [manualPartsCount, setManualPartsCount] = useState('');
  const [manualChaptersCount, setManualChaptersCount] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 350);

  const search = useMetadataSearch(debouncedQuery, selectedLang);
  const createWork = useCreateWork();

  async function addFromCandidate(candidate: MetadataCandidate) {
    setError(null);
    try {
      const selectedLangObj = LANGUAGES.find((l) => l.code === selectedLang);
      const readingLang = selectedLangObj && selectedLangObj.code !== 'all' ? selectedLangObj.label : (candidate.language || 'English');

      const work = await createWork.mutateAsync({
        title: candidate.title,
        authors: candidate.authors,
        coverImageUrl: candidate.coverImageUrl,
        externalSource: candidate.externalSource,
        externalId: candidate.externalId,
        description: candidate.description ?? null,
        originalLanguage: candidate.originalLanguage || 'Japanese',
        language: readingLang,
        partsCount: candidate.partsCount ?? null,
        chaptersCount: candidate.chaptersCount ?? null,
        seriesName: candidate.seriesName || null,
      });
      onAdded(work.id);
    } catch (err) {
      setError(errorMessage(err, 'Could not add this book.'));
    }
  }

  async function handleManualSubmit() {
    if (!manualTitle.trim()) return;
    setError(null);
    try {
      const work = await createWork.mutateAsync({
        title: manualTitle.trim(),
        authors: manualAuthor.trim() ? [manualAuthor.trim()] : [],
        description: manualDescription.trim() || null,
        originalLanguage: manualOriginalLang.trim() || 'English',
        language: manualReadingLang.trim() || 'English',
        partsCount: manualPartsCount ? parseInt(manualPartsCount, 10) : null,
        chaptersCount: manualChaptersCount ? parseInt(manualChaptersCount, 10) : null,
      });
      onAdded(work.id);
    } catch (err) {
      setError(errorMessage(err, 'Could not add this book.'));
    }
  }

  return (
    <Modal title={selectedCandidate ? "Book Details" : "Add a book"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <ErrorBanner message={error} />}

        {selectedCandidate ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="w-28 sm:w-32 flex-shrink-0 self-center sm:self-start shadow-md rounded-md overflow-hidden">
                <BookCover title={selectedCandidate.title} coverImageUrl={selectedCandidate.coverImageUrl} />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-serif text-lg font-bold text-paper-900 leading-snug">{selectedCandidate.title}</h3>
                  <span className="shrink-0 rounded bg-paper-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-paper-700">
                    {selectedCandidate.externalSource.replace('-', ' ')}
                  </span>
                </div>
                <p className="text-sm font-medium text-paper-700">
                  {selectedCandidate.authors.join(', ') || 'Unknown Author'}
                  {selectedCandidate.firstPublishYear ? ` · ${selectedCandidate.firstPublishYear}` : ''}
                </p>

                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {selectedCandidate.originalLanguage && (
                    <span className="rounded bg-amber-100/90 px-2 py-0.5 text-xs font-medium text-amber-900 border border-amber-200">
                      Orig: {selectedCandidate.originalLanguage}
                    </span>
                  )}
                  <span className="rounded bg-blue-100/90 px-2 py-0.5 text-xs font-medium text-blue-900 border border-blue-200">
                    Added: {LANGUAGES.find((l) => l.code === selectedLang)?.code !== 'all' ? LANGUAGES.find((l) => l.code === selectedLang)?.label : (selectedCandidate.language || 'English')}
                  </span>
                  {selectedCandidate.partsCount && (
                    <span className="rounded bg-emerald-100/90 px-2 py-0.5 text-xs font-medium text-emerald-900 border border-emerald-200">
                      {selectedCandidate.partsCount} Parts
                    </span>
                  )}
                  {selectedCandidate.chaptersCount && (
                    <span className="rounded bg-purple-100/90 px-2 py-0.5 text-xs font-medium text-purple-900 border border-purple-200">
                      {selectedCandidate.chaptersCount} Chapters
                    </span>
                  )}
                </div>

                {selectedCandidate.description && (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-md bg-paper-100/60 p-3 border border-paper-200/60">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-paper-600 mb-1">Book Summary</h4>
                    <p className="text-xs text-paper-700 leading-relaxed whitespace-pre-line">{selectedCandidate.description}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-paper-200">
              <Button variant="secondary" onClick={() => setSelectedCandidate(null)}>
                Back to search
              </Button>
              <Button onClick={() => addFromCandidate(selectedCandidate)} isLoading={createWork.isPending}>
                Add to Library
              </Button>
            </div>
          </div>
        ) : !showManual ? (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
                <input
                  autoFocus
                  placeholder="Search by title, author, or keyword…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="focus-visible:focus-ring w-full rounded-md border border-paper-300 bg-paper-50 py-2 pl-9 pr-3 text-sm text-paper-900 placeholder:text-paper-400"
                />
              </div>
              <select
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
                className="focus-visible:focus-ring rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-xs font-medium text-paper-800"
                aria-label="Target language filter"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {search.isFetching && (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              )}
              {!search.isFetching && debouncedQuery && search.data?.length === 0 && (
                <p className="py-6 text-center text-sm text-paper-500">No matches found. Try selecting another language or adding manually.</p>
              )}
              <ul className="flex flex-col gap-2.5">
                {search.data?.map((candidate) => (
                  <li key={`${candidate.externalSource}-${candidate.externalId}`}>
                    <button
                      type="button"
                      disabled={createWork.isPending}
                      onClick={() => setSelectedCandidate(candidate)}
                      className="focus-visible:focus-ring flex w-full items-start gap-3 rounded-lg border border-paper-200 p-3 text-left transition-all hover:border-moss-400 hover:bg-moss-50/50 disabled:opacity-50"
                    >
                      <div className="w-12 flex-shrink-0 pt-0.5">
                        <BookCover title={candidate.title} coverImageUrl={candidate.coverImageUrl} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-serif text-sm font-bold text-paper-900 leading-tight">{candidate.title}</p>
                          <span className="shrink-0 rounded bg-paper-200/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-paper-600">
                            {candidate.externalSource.replace('-', ' ')}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs font-medium text-paper-600">
                          {candidate.authors.join(', ') || 'Unknown Author'}
                          {candidate.firstPublishYear ? ` · ${candidate.firstPublishYear}` : ''}
                        </p>

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {candidate.originalLanguage && (
                            <span className="rounded bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 border border-amber-200">
                              Orig: {candidate.originalLanguage}
                            </span>
                          )}
                          {candidate.language && (
                            <span className="rounded bg-blue-100/80 px-1.5 py-0.5 text-[10px] font-medium text-blue-900 border border-blue-200">
                              Added: {candidate.language}
                            </span>
                          )}
                          {candidate.partsCount && (
                            <span className="rounded bg-emerald-100/80 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900 border border-emerald-200">
                              {candidate.partsCount} Parts
                            </span>
                          )}
                          {candidate.chaptersCount && (
                            <span className="rounded bg-purple-100/80 px-1.5 py-0.5 text-[10px] font-medium text-purple-900 border border-purple-200">
                              {candidate.chaptersCount} Chapters
                            </span>
                          )}
                        </div>

                        {candidate.description && (
                          <p className="mt-1.5 line-clamp-2 text-xs text-paper-500 leading-relaxed">
                            {candidate.description}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="focus-visible:focus-ring self-start text-xs font-medium text-moss-700 hover:underline"
            >
              Can&rsquo;t find your book? Add custom book manually
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Input
              autoFocus
              label="Book Title"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="e.g. Days at the Morisaki Bookshop"
            />
            <Input
              label="Author(s)"
              value={manualAuthor}
              onChange={(e) => setManualAuthor(e.target.value)}
              placeholder="e.g. Satoshi Yagisawa"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Original Language"
                value={manualOriginalLang}
                onChange={(e) => setManualOriginalLang(e.target.value)}
                placeholder="e.g. Japanese"
              />
              <Input
                label="Your Added Language"
                value={manualReadingLang}
                onChange={(e) => setManualReadingLang(e.target.value)}
                placeholder="e.g. English"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Parts Count (optional)"
                type="number"
                value={manualPartsCount}
                onChange={(e) => setManualPartsCount(e.target.value)}
                placeholder="e.g. 2"
              />
              <Input
                label="Chapters Count (optional)"
                type="number"
                value={manualChaptersCount}
                onChange={(e) => setManualChaptersCount(e.target.value)}
                placeholder="e.g. 14"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-paper-700 mb-1">Book Summary (optional)</label>
              <textarea
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder="Enter a brief synopsis or summary of the book..."
                rows={3}
                className="focus-visible:focus-ring w-full rounded-md border border-paper-300 bg-paper-50 p-2 text-xs text-paper-900 placeholder:text-paper-400"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowManual(false)}>
                Back to search
              </Button>
              <Button onClick={handleManualSubmit} isLoading={createWork.isPending} disabled={!manualTitle.trim()}>
                Add book
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
