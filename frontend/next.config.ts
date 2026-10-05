import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone for the Docker image.
  output: "standalone",
  // the dev-only "N" badge covers the call bar's Session button; errors still show in the overlay
  devIndicators: false,
  turbopack: {
    ignoreIssue: [
      // TalkingHead loads its lip-sync language files by a computed path (import(path +
      // "lipsync-" + lang)), which a bundler can't follow, so the build fails. We never
      // load them (lipsyncModules: []): HeadTTS sends the mouth shapes itself
      {
        path: /@met4citizen\/talkinghead\/modules\/talkinghead\.mjs$/,
        // a regex: the full title goes on ("…: Can't resolve <dynamic>")
        title: /^Module not found/,
      },
    ],
  },
};

export default nextConfig;
