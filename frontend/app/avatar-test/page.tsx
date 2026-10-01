"use client";

import dynamic from "next/dynamic";

// Temporary page to try the avatar on its own - will move into /interview
// A client page because ssr: false isn't allowed in Server Components
const TalkingHeadAvatar = dynamic(
  async () => (await import("@/components/avatar/talking-head")).TalkingHeadAvatar,
  { ssr: false },
);

export default function AvatarTestPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <TalkingHeadAvatar />
    </main>
  );
}
