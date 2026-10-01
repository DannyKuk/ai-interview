"use client";

import { ImageIcon, PhoneOffIcon, VolumeOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type CallBarProps = {
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  stillImage: boolean;
  onStillImageChange: (stillImage: boolean) => void;
  ended: boolean;
  onEnd: () => void;
};

export function CallBar({
  muted,
  onMutedChange,
  stillImage,
  onStillImageChange,
  ended,
  onEnd,
}: CallBarProps) {
  return (
    <footer className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-2">
      <div className="col-start-2 flex justify-center gap-4">
        <CallButton
          label="Mute"
          pressed={muted}
          onClick={() => onMutedChange(!muted)}
          title={muted ? "Turn the interviewer's voice on" : "Mute the interviewer"}
        >
          <VolumeOffIcon />
        </CallButton>
        <CallButton
          label="Still image"
          pressed={stillImage}
          onClick={() => onStillImageChange(!stillImage)}
          title={
            stillImage
              ? "Show the 3D interviewer"
              : "Show a still image instead of the 3D interviewer (lighter for slow computers)"
          }
        >
          <ImageIcon />
        </CallButton>
      </div>
      {!ended && (
        <Button variant="destructive" className="justify-self-end rounded-full" onClick={onEnd}>
          <PhoneOffIcon />
          End interview
        </Button>
      )}
    </footer>
  );
}

type CallButtonProps = {
  label: string;
  pressed: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
};

function CallButton({ label, pressed, onClick, title, children }: CallButtonProps) {
  return (
    <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
      <Button
        variant="secondary"
        size="icon-lg"
        aria-pressed={pressed}
        aria-label={label}
        title={title}
        onClick={onClick}
        className="size-11 rounded-full aria-pressed:bg-foreground aria-pressed:text-background"
      >
        {children}
      </Button>
      {label}
    </div>
  );
}
