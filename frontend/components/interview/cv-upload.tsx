"use client";

import { FileCheckIcon, UploadIcon } from "lucide-react";
import { useState } from "react";

import { Spinner } from "@/components/ui/spinner";
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
      const { value: profile, ...price } = await parseCv(file);
      setProfile(profile, price);
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
          "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3.5 text-sm transition-colors hover:bg-muted/50 has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
          dragging && "border-primary bg-primary/10",
          ownCv && "border-solid border-primary/20 bg-primary/10",
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
          <Spinner className="size-5 shrink-0 text-primary" />
        ) : ownCv ? (
          <FileCheckIcon className="size-5 shrink-0 text-primary" />
        ) : (
          <UploadIcon className="size-5 shrink-0 text-primary" />
        )}
        <span className="flex min-w-0 flex-col">
          {uploading ? (
            <span>Reading your CV… this takes about 10 seconds.</span>
          ) : ownCv ? (
            <>
              <span className="font-medium">Your CV: {ownCv.first_name ?? "uploaded"}</span>
              <span className="text-muted-foreground">
                {ownCv.headline}. Drop or pick another PDF to replace it.
              </span>
            </>
          ) : (
            <>
              <span className="font-medium">Drop your CV here, or choose a file</span>
              <span className="text-muted-foreground">
                PDF, up to 5 pages and 5 MB. The PDF itself isn&apos;t stored.
              </span>
            </>
          )}
        </span>
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
