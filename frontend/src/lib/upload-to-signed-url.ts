export interface UploadProgress {
  loaded: number;
  total: number;
}

// The signed URL points directly at S3/MinIO — a plain PUT, not through
// our API client (no envelope, no Bearer auth; the signature in the URL
// itself is the auth). Uses XHR rather than fetch for upload-progress
// events (T-028/T-029's import flow, and T-109's cover-photo upload,
// both show a progress bar).
export function uploadToSignedUrl(url: string, file: File, onProgress?: (progress: UploadProgress) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.({ loaded: event.loaded, total: event.total });
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(file);
  });
}
