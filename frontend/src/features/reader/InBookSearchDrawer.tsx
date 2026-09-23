import { Search, X, Loader2, BookOpen } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';

export interface SearchMatch {
  id: string;
  target: string;
  snippet: string;
  chapterLabel?: string;
}

interface InBookSearchDrawerProps {
  onSearch: (query: string) => Promise<SearchMatch[]>;
  onSelectResult: (target: string) => void;
  onClose: () => void;
}

export function InBookSearchDrawer({ onSearch, onSelectResult, onClose }: InBookSearchDrawerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setIsSearching(true);
    setHasSearched(true);
    try {
      const res = await onSearch(q);
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-paper-300 bg-paper-50 p-4 shadow-2xl transition-all sm:rounded-l-2xl">
      <div className="flex items-center justify-between border-b border-paper-200 pb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-paper-800">In-Book Search</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search drawer"
          className="focus-visible:focus-ring rounded-md p-1.5 text-paper-500 hover:bg-paper-100 hover:text-paper-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search words or phrases..."
            className="w-full rounded-lg border border-paper-300 bg-paper-100 py-2 pl-8 pr-3 text-xs text-paper-900 placeholder:text-paper-400 focus:border-moss-600 focus:outline-none focus:ring-1 focus:ring-moss-600"
          />
        </div>
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="rounded-lg bg-moss-700 px-3 py-2 text-xs font-semibold text-paper-50 hover:bg-moss-800 disabled:opacity-40 transition-colors"
        >
          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
        </button>
      </form>

      <div className="mt-4 flex-1 overflow-y-auto">
        {isSearching && (
          <div className="flex flex-col items-center justify-center py-12 text-paper-500">
            <Loader2 className="h-6 w-6 animate-spin text-moss-600 mb-2" />
            <span className="text-xs">Searching book contents...</span>
          </div>
        )}

        {!isSearching && hasSearched && results.length === 0 && (
          <div className="py-12 text-center text-xs text-paper-500">
            No occurrences found for &quot;<span className="font-semibold text-paper-700">{query}</span>&quot;.
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="px-1 text-xs font-medium text-paper-500">
              Found {results.length} result{results.length > 1 ? 's' : ''}:
            </p>
            <ul className="flex flex-col gap-2">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectResult(item.target);
                      onClose();
                    }}
                    className="group w-full rounded-lg border border-paper-200 bg-paper-100/70 p-3 text-left transition-all hover:border-moss-400 hover:bg-moss-50/60 hover:shadow-sm"
                  >
                    {item.chapterLabel && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-moss-800 mb-1">
                        <BookOpen className="h-3 w-3" />
                        {item.chapterLabel}
                      </span>
                    )}
                    <p className="text-xs text-paper-800 line-clamp-3 leading-relaxed">
                      &quot;{item.snippet}&quot;
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
