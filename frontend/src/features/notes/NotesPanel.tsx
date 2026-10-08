import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useCreateNote, useDeleteNote, useNotes, useUpdateNote } from '../../lib/api/notes';
import { NoteComposerModal } from './NoteComposerModal';

const SCOPE_LABELS: Record<string, string> = {
  BOOK: 'Book',
  CHAPTER: 'Chapter',
  SECTION: 'Section',
  PAGE: 'Page',
  PASSAGE: 'Passage',
  SESSION: 'Session',
};

// Standalone book/chapter/session-level notes (SRS §13.1, T-047) — distinct
// from a highlight's margin note (T-046's AnnotationsDrawer). This panel
// only offers BOOK-scope creation; chapter and session notes are created
// from the reader and the physical-session flow, where that context exists.
export function NotesPanel({ workId }: { workId: string }) {
  const notes = useNotes(workId);
  const createNote = useCreateNote(workId);
  const updateNote = useUpdateNote(workId);
  const deleteNote = useDeleteNote(workId);
  const [showComposer, setShowComposer] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (notes.isLoading) {
    return <p className="text-sm text-paper-600">Loading notes…</p>;
  }

  const items = notes.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {notes.isError && <p className="text-sm text-red-700">Couldn&apos;t load notes. Please try again.</p>}

      {items.length === 0 ? (
        <p className="text-sm text-paper-600">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((note) => (
            <li key={note.id} className="rounded-md border border-paper-200 bg-paper-100/70 p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded bg-paper-200 px-1.5 py-0.5 text-[10px] font-bold text-paper-700">
                  {SCOPE_LABELS[note.scope] ?? note.scope}
                </span>
                <button
                  type="button"
                  onClick={() => setDeletingId(note.id)}
                  className="p-1 text-paper-400 hover:text-red-600 rounded"
                  title="Delete note"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {editingId === note.id ? (
                <div className="flex flex-col gap-1.5">
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                    autoFocus
                    className="w-full rounded border border-paper-300 bg-paper-50 p-1.5 text-sm text-paper-900 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2 text-xs">
                    <button type="button" onClick={() => setEditingId(null)} className="text-paper-700 hover:text-paper-900">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateNote.mutate({ id: note.id, body: editBody.trim() });
                        setEditingId(null);
                      }}
                      className="font-semibold text-moss-700 hover:underline"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <p
                  className="cursor-text text-sm text-paper-800"
                  onClick={() => {
                    setEditingId(note.id);
                    setEditBody(note.body);
                  }}
                >
                  {note.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="secondary" size="sm" onClick={() => setShowComposer(true)} className="self-start">
        <Plus className="h-3.5 w-3.5" /> Add note
      </Button>

      {showComposer && (
        <NoteComposerModal
          title="Add a book note"
          scopeOptions={[{ value: 'BOOK', label: 'Book' }]}
          isSaving={createNote.isPending}
          onSave={(body, scope) => {
            createNote.mutate(
              { scope, body },
              { onSuccess: () => setShowComposer(false) },
            );
          }}
          onClose={() => setShowComposer(false)}
        />
      )}

      {deletingId && (
        <ConfirmDialog
          title="Delete this note?"
          message="This can't be undone."
          confirmLabel="Delete"
          isConfirming={deleteNote.isPending}
          onConfirm={() => {
            deleteNote.mutate(deletingId, { onSuccess: () => setDeletingId(null) });
          }}
          onClose={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
