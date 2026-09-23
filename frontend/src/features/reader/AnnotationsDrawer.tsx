import { Highlighter, Quote, Trash2, X, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import type { HighlightAnnotation } from '../../lib/annotations';
import { COLOR_HEX_MAP } from '../../lib/annotations';

interface AnnotationsDrawerProps {
  annotations: HighlightAnnotation[];
  onSelectAnnotation: (position: string) => void;
  onRemoveAnnotation: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
  onClose: () => void;
}

export function AnnotationsDrawer({
  annotations,
  onSelectAnnotation,
  onRemoveAnnotation,
  onUpdateNote,
  onClose,
}: AnnotationsDrawerProps) {
  const [tab, setTab] = useState<'all' | 'quotes'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState('');

  const filtered = tab === 'quotes' ? annotations.filter((a) => a.isQuote) : annotations;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-paper-300 bg-paper-50 p-4 shadow-2xl transition-all sm:rounded-l-2xl">
      <div className="flex items-center justify-between border-b border-paper-200 pb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-paper-800">Highlights &amp; Quotes</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close annotations drawer"
          className="focus-visible:focus-ring rounded-md p-1.5 text-paper-500 hover:bg-paper-100 hover:text-paper-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="mt-3 flex rounded-lg border border-paper-200 bg-paper-100 p-1 text-xs">
        <button
          type="button"
          onClick={() => setTab('all')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-semibold transition-all ${
            tab === 'all' ? 'bg-paper-50 font-bold text-paper-900 shadow-sm' : 'text-paper-600 hover:text-paper-900'
          }`}
        >
          <Highlighter className="h-3.5 w-3.5" />
          <span>All Highlights ({annotations.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('quotes')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-semibold transition-all ${
            tab === 'quotes' ? 'bg-paper-50 font-bold text-paper-900 shadow-sm' : 'text-paper-600 hover:text-paper-900'
          }`}
        >
          <Quote className="h-3.5 w-3.5" />
          <span>Saved Quotes ({annotations.filter((a) => a.isQuote).length})</span>
        </button>
      </div>

      {/* Content List */}
      <div className="mt-4 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-paper-500">
            {tab === 'quotes' ? 'No saved quotes yet.' : 'No highlights or notes yet. Select text while reading to add one.'}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((item) => {
              const colorInfo = COLOR_HEX_MAP[item.color] || COLOR_HEX_MAP.yellow;
              const isEditing = editingId === item.id;

              return (
                <li
                  key={item.id}
                  style={{ borderLeftColor: colorInfo.border }}
                  className="group rounded-r-lg border border-l-4 border-paper-200 bg-paper-100/70 p-3 shadow-xs transition-all hover:bg-paper-100"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold border ${colorInfo.badge}`}>
                      {item.isQuote ? <Quote className="h-2.5 w-2.5" /> : <Highlighter className="h-2.5 w-2.5" />}
                      {item.isQuote ? 'Quote' : item.color}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectAnnotation(item.position);
                          onClose();
                        }}
                        className="text-[11px] font-medium text-moss-700 hover:underline"
                      >
                        Jump to spot
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveAnnotation(item.id)}
                        className="p-1 text-paper-400 hover:text-red-600 rounded"
                        title="Delete highlight"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs font-serif italic text-paper-900 leading-relaxed bg-paper-50/60 p-2 rounded border border-paper-200/50">
                    &quot;{item.text}&quot;
                  </p>

                  {/* Note Section */}
                  {item.note && !isEditing && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-paper-700 bg-moss-50/60 p-2 rounded border border-moss-200/50">
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-moss-600 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-semibold text-moss-900 block text-[11px]">Margin Note:</span>
                        <p className="text-paper-800">{item.note}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditNoteText(item.note || '');
                        }}
                        className="text-[10px] text-moss-700 hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                  )}

                  {!item.note && !isEditing && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditNoteText('');
                      }}
                      className="mt-2 text-[11px] font-medium text-paper-500 hover:text-moss-700 flex items-center gap-1"
                    >
                      + Add margin note
                    </button>
                  )}

                  {isEditing && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      <textarea
                        value={editNoteText}
                        onChange={(e) => setEditNoteText(e.target.value)}
                        placeholder="Write your note..."
                        rows={2}
                        className="w-full rounded border border-paper-300 bg-paper-50 p-1.5 text-xs text-paper-900 focus:outline-none"
                      />
                      <div className="flex justify-end gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-paper-500 hover:text-paper-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateNote(item.id, editNoteText.trim());
                            setEditingId(null);
                          }}
                          className="font-semibold text-moss-700 hover:underline"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
