import { useMutation } from '@tanstack/react-query';
import { api } from './client';
import { uploadToSignedUrl, type UploadProgress } from '../upload-to-signed-url';
import type { DigitalFile } from './types';

export type { UploadProgress };

export function useUploadDigitalFile() {
  return useMutation({
    mutationFn: async ({
      file,
      onProgress,
    }: {
      file: File;
      onProgress?: (progress: UploadProgress) => void;
    }): Promise<DigitalFile> => {
      const { fileId, uploadUrl } = await api.post<{ fileId: string; uploadUrl: string }>('/files/upload-url', {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      await uploadToSignedUrl(uploadUrl, file, onProgress);

      return api.post<DigitalFile>(`/files/${fileId}/confirm`);
    },
  });
}
