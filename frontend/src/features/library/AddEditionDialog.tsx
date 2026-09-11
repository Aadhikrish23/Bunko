import { BookOpen, FileText, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Modal } from '../../components/ui/Modal';
import { useCreateCopy, useCreateEdition } from '../../lib/api/editions';
import { useUploadDigitalFile } from '../../lib/api/files';
import type { EditionFormat } from '../../lib/api/types';
import { errorMessage } from '../../lib/error-message';

const FORMATS: { value: EditionFormat; label: string; icon: typeof BookOpen; accept?: string; mime?: string }[] = [
  { value: 'PHYSICAL', label: 'Physical copy', icon: BookOpen },
  { value: 'EPUB', label: 'EPUB file', icon: FileText, accept: '.epub', mime: 'application/epub+zip' },
  { value: 'PDF', label: 'PDF file', icon: FileText, accept: '.pdf', mime: 'application/pdf' },
];

export function AddEditionDialog({ workId, onClose, onAdded }: { workId: string; onClose: () => void; onAdded: () => void }) {
  const [format, setFormat] = useState<EditionFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createEdition = useCreateEdition();
  const createCopy = useCreateCopy();
  const uploadFile = useUploadDigitalFile();

  const isBusy = createEdition.isPending || createCopy.isPending || uploadFile.isPending;

  async function addPhysical() {
    setError(null);
    try {
      const edition = await createEdition.mutateAsync({ workId, format: 'PHYSICAL' });
      await createCopy.mutateAsync({ editionId: edition.id });
      onAdded();
    } catch (err) {
      setError(errorMessage(err, 'Could not add this edition.'));
    }
  }

  async function addDigital(selectedFormat: 'EPUB' | 'PDF', file: File) {
    setError(null);
    setUploadPercent(0);
    try {
      const digitalFile = await uploadFile.mutateAsync({
        file,
        onProgress: (p) => setUploadPercent(Math.round((p.loaded / p.total) * 100)),
      });
      const edition = await createEdition.mutateAsync({ workId, format: selectedFormat });
      await createCopy.mutateAsync({ editionId: edition.id, digitalFileId: digitalFile.id });
      onAdded();
    } catch (err) {
      setError(errorMessage(err, 'Could not import this file.'));
    } finally {
      setUploadPercent(null);
    }
  }

  function handleFormatClick(option: (typeof FORMATS)[number]) {
    setFormat(option.value);
    if (option.value === 'PHYSICAL') {
      addPhysical();
    } else {
      fileInputRef.current?.setAttribute('accept', option.accept ?? '');
      fileInputRef.current?.click();
    }
  }

  function handleFileChange() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || (format !== 'EPUB' && format !== 'PDF')) return;
    addDigital(format, file);
  }

  return (
    <Modal title="Add an edition" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <ErrorBanner message={error} />}

        {uploadPercent !== null ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Upload className="h-6 w-6 animate-pulse text-moss-600" strokeWidth={1.5} />
            <p className="text-sm text-paper-600">Uploading and importing… {uploadPercent}%</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-200">
              <div className="h-full bg-moss-500 transition-all" style={{ width: `${uploadPercent}%` }} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {FORMATS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={isBusy}
                onClick={() => handleFormatClick(option)}
                className="focus-visible:focus-ring flex items-center gap-3 rounded-md border border-paper-200 p-3 text-left hover:border-moss-300 hover:bg-moss-50 disabled:opacity-50"
              >
                <option.icon className="h-5 w-5 text-moss-600" strokeWidth={1.5} />
                <span className="text-sm font-medium text-paper-900">{option.label}</span>
              </button>
            ))}
          </div>
        )}

        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
      </div>
    </Modal>
  );
}
