"use client";

import { useState } from "react";

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/gif";
// max size 4MB, same as the server limit
const MAX_FILE_SIZE = 4 * 1024 * 1024;

export function ImageUpload({ onUploaded }: { onUploaded: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setError("Image must be 4MB or smaller.");
      return;
    }

    setUploading(true);
    setError(null);

    const body = new FormData();
    body.append("image", file);

    try {
      const res = await fetch("/admin/posts/upload", { method: "POST", body });
      const result = await res.json();

      if (!res.ok) {
        setError(result.error ?? "Upload failed. Please try again.");
        return;
      }

      onUploaded(result.url);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor="image-upload"
        className={`w-fit rounded border px-3 py-2 text-sm ${
          uploading ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
      >
        {uploading ? "Uploading…" : "Insert image"}
      </label>
      <input
        type="file"
        id="image-upload"
        accept={ACCEPTED_TYPES}
        disabled={uploading}
        onChange={handleChange}
        className="sr-only"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
