// Splits the streamed interviewer reply into sentences, so the first one can be spoken
// while the rest is still being written (FR-18)

// a "." after these isn't the end of a sentence ("e.g. Kafka", "Dr. Smith"). Not "ms":
// in an interview "200 ms." is milliseconds at the end of a sentence
const ABBREVIATIONS = new Set([
  "e.g",
  "i.e",
  "etc",
  "vs",
  "approx",
  "mr",
  "mrs",
  "dr",
  "prof",
  "inc",
  "ltd",
  "jr",
  "sr",
  "st",
]);

// the end of a sentence: . ! ? … (maybe several, maybe closing quotes or brackets),
// then whitespace. "3.5" or "Node.js" have no space after the dot, so they don't count.
// A line break always ends one (lists)
const BOUNDARY = /[.!?…]+["'”’)\]]*\s+|\n+/g;

function isAbbreviation(textBefore: string): boolean {
  const word = textBefore.match(/(\S+)\.$/)?.[1]?.toLowerCase();
  // single letters too: initials and "U.S."
  return !!word && (ABBREVIATIONS.has(word) || /^([a-z]\.)*[a-z]$/.test(word));
}

// what a voice shouldn't read out: markdown the model sometimes writes anyway
export function speakable(sentence: string): string {
  return sentence
    .replace(/[*_`#]+/g, "")
    .replace(/^\s*[-•]\s+/, "")
    .trim();
}

export class SentenceSplitter {
  private buffer = "";

  push(text: string): string[] {
    this.buffer += text;
    const sentences: string[] = [];
    let start = 0;

    for (const match of this.buffer.matchAll(BOUNDARY)) {
      const end = match.index + match[0].length;
      const candidate = this.buffer.slice(start, match.index + match[0].trimEnd().length);
      // "e.g. " isn't an ending: keep going until the next boundary
      if (match[0].startsWith(".") && isAbbreviation(candidate)) continue;
      sentences.push(candidate);
      start = end;
    }

    this.buffer = this.buffer.slice(start);

    return sentences.map(speakable).filter(Boolean);
  }

  // the reply is complete
  flush(): string[] {
    const rest = speakable(this.buffer);
    this.buffer = "";
    return rest ? [rest] : [];
  }
}
