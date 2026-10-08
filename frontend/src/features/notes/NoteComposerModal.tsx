import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import type { NoteScope } from '../../lib/api/types';

interface ScopeOption {
  value: NoteScope;
  label: string;
}

interface NoteComposerModalProps {
  title?: string;
  scopeOptions: ScopeOption[];
  isSaving?: boolean;
  onSave: (body: string, scope: NoteScope) => void;
  onClose: () => void;
}

// Shared by the reader's "Add Note" toolbar action and the book detail
// page's standalone-notes panel (T-047) — the only difference between
// callers is which scopes are offered, since a note's required fields
// (position/copyId) are resolved by the caller before onSave fires.
export function NoteComposerModal({
  title = 'Add a note',
  scopeOptions,
  isSaving = false,
  onSave,
  onClose,
}: NoteComposerModalProps) {
  const [scope, setScope] = useState<NoteScope>(scopeOptions[0]?.value ?? 'BOOK');
  const [body, setBody] = useState('');

  function handleSave() {
    const trimmed = body.trim();
    if (!trimmed) return;
    onSave(trimmed, scope);
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {scopeOptions.length > 1 && (
          <div className="flex rounded-lg border border-paper-200 bg-paper-100 p-1 text-xs">
            {scopeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setScope(option.value)}
                className={`flex-1 rounded-md py-1.5 font-semibold transition-all ${
                  scope === option.value
                    ? 'bg-paper-50 font-bold text-paper-900 shadow-sm'
                    : 'text-paper-600 hover:text-paper-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your note…"
          rows={5}
          autoFocus
          className="w-full rounded-md border border-paper-300 bg-paper-50 p-2.5 text-sm text-paper-900 focus:border-moss-600 focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} isLoading={isSaving} disabled={!body.trim()}>
            Save note
          </Button>
        </div>
      </div>
    </Modal>
  );
}
