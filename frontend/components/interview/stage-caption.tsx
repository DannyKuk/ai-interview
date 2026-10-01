type StageCaptionProps = {
  spoken: string | null; // the interviewer's sentence that's playing
  dictation: string | null; // the candidate's live words while recording
};

export function StageCaption({ spoken, dictation }: StageCaptionProps) {
  const text = dictation ?? spoken;
  if (!text) {
    return null;
  }

  return (
    <p className="absolute inset-x-0 bottom-4 mx-auto w-[min(86%,680px)] rounded-lg bg-background/80 px-3.5 py-2 text-center backdrop-blur">
      {dictation !== null && <span className="mr-2 font-semibold">You</span>}
      {text}
    </p>
  );
}
