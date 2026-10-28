import { ImagePlus, Loader2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useProcessImage, useUploadImage } from '../../lib/api/images';
import { errorMessage } from '../../lib/error-message';

// Standard book-cover proportions (2:3), matching the backend's processed
// output size (images.service.ts's COVER_WIDTH/COVER_HEIGHT).
const COVER_RATIO = 2 / 3;

/**
 * A cropped region doesn't come from a drag-to-crop UI here (T-109) --
 * that's real interactive-UI work worth its own pass. Instead this picks
 * the largest centered region already at cover proportions, which is
 * right for a typical cover photo (the book fills most of the frame) and
 * always produces a predictable, previewable result. The preview below is
 * exactly what gets uploaded, so a reader unhappy with the crop can just
 * pick a different photo rather than fight a crop tool.
 */
function centeredCoverCrop(width: number, height: number): { x: number; y: number; width: number; height: number } {
  const sourceRatio = width / height;
  let cropWidth = width;
  let cropHeight = height;
  if (sourceRatio > COVER_RATIO) {
    cropWidth = height * COVER_RATIO;
  } else {
    cropHeight = width / COVER_RATIO;
  }
  return {
    x: (width - cropWidth) / 2 / width,
    y: (height - cropHeight) / 2 / height,
    width: cropWidth / width,
    height: cropHeight / height,
  };
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image"));
    };
    img.src = url;
  });
}

export function CoverPhotoUpload({
  label,
  url,
  onChange,
}: {
  label: string;
  url: string | null;
  onChange: (url: string | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadImage = useUploadImage();
  const processImage = useProcessImage();
  const busy = uploadImage.isPending || processImage.isPending;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const dimensions = await readImageDimensions(file);
      const uploaded = await uploadImage.mutateAsync({ file });
      const processed = await processImage.mutateAsync({ imageId: uploaded.id, crop: centeredCoverCrop(dimensions.width, dimensions.height) });
      onChange(processed.url);
    } catch (err) {
      setError(errorMessage(err, "Couldn't use that photo."));
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-paper-700">{label}</label>
      {error && <p className="text-xs text-ember-600">{error}</p>}
      {url ? (
        <div className="relative w-20">
          <img src={url} alt={label} className="aspect-[2/3] w-full rounded-md object-cover shadow-card" />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Remove ${label.toLowerCase()}`}
            className="focus-visible:focus-ring absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-paper-900 text-paper-50 shadow-card"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="focus-visible:focus-ring flex aspect-[2/3] w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-paper-300 text-paper-500 hover:border-moss-400 hover:text-moss-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          <span className="text-[10px] font-medium">{busy ? 'Uploading…' : 'Add photo'}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
