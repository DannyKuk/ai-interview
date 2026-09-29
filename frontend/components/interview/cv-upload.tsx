"use client";

import { useState } from "react";

import { errorMessage, MAX_CV_BYTES, parseCv } from "@/lib/api";
import { useInterviewStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type CvUploadProps = {
  locked: boolean; // the form is busy
  onUploadingChange: (uploading: boolean) => void; // the form locks while a CV is read
};

// the browser only checks what it can (a PDF, the size); the backend checks the content
function checkFile(file: File): string | null {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return "Please upload your CV as a PDF.";
  }
  if (file.size > MAX_CV_BYTES) {
    return "Your CV is too big. Please upload a PDF of up to 5 MB.";
  }
  return null;
}

export function CvUpload({ locked, onUploadingChange }: CvUploadProps) {
  const presetId = useInterviewStore((state) => state.presetId);
  const profile = useInterviewStore((state) => state.profile);
  const setProfile = useInterviewStore((state) => state.setProfile);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ownCv = profile && !presetId ? profile : null;

  async function upload(file: File) {
    const problem = checkFile(file);
    setError(problem);

    if (problem) {
      return;
    }

    setUploading(true);
    onUploadingChange(true);

    try {
      setProfile(await parseCv(file));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setUploading(false);
      onUploadingChange(false);
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      upload(file);
    }
  }

  // dragover must call preventDefault, else the browser opens the PDF instead of dropping it
  function handleDragOver(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(true);
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    // a disabled fieldset blocks the file input, but not drops on the label
    if (file && !locked && !uploading) {
      upload(file);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        onDragOver={handleDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed p-6 text-center text-sm transition-colors hover:bg-muted",
          dragging && "border-primary bg-muted",
          ownCv && "border-solid border-primary ring-2 ring-primary",
          uploading && "cursor-wait",
        )}
      >
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={handleChange}
        />
        {uploading ? (
          <span>Reading your CV… this takes about 10 seconds.</span>
        ) : ownCv ? (
          <>
            <span className="font-semibold">Your CV: {ownCv.first_name ?? "uploaded"}</span>
            <span className="text-muted-foreground">
              {ownCv.headline}. Drop or pick another PDF to replace it.
            </span>
          </>
        ) : (
          <>
            <span className="font-semibold">Or use your own CV</span>
            <span className="text-muted-foreground">
              Drop a PDF here or click to pick one (up to 5 MB, 5 pages). The PDF itself isn&apos;t
              stored.
            </span>
          </>
        )}
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
