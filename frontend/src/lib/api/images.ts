import { useMutation } from '@tanstack/react-query';
import { api } from './client';
import { uploadToSignedUrl, type UploadProgress } from '../upload-to-signed-url';

export type { UploadProgress };

export interface UploadedImage {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}

// Cover photos (T-108/T-109) — same upload-url/confirm shape as
// useUploadDigitalFile (lib/api/files.ts), against a separate endpoint
// and storage quota since images aren't book files.
export function useUploadImage() {
  return useMutation({
    mutationFn: async ({
      file,
      onProgress,
    }: {
      file: File;
      onProgress?: (progress: UploadProgress) => void;
    }): Promise<UploadedImage> => {
      const { imageId, uploadUrl } = await api.post<{ imageId: string; uploadUrl: string }>('/images/upload-url', {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      await uploadToSignedUrl(uploadUrl, file, onProgress);

      return api.post<UploadedImage>(`/images/${imageId}/confirm`);
    },
  });
}

export interface ImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Crops an already-confirmed upload to standard cover proportions and upscales it (T-109). */
export function useProcessImage() {
  return useMutation({
    mutationFn: ({ imageId, crop }: { imageId: string; crop: ImageCrop }) =>
      api.post<UploadedImage>(`/images/${imageId}/process`, { crop }),
  });
}
