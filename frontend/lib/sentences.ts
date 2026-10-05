// Splits the streamed interviewer reply into sentences, so the first one can be spoken
// while the rest is still being written

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
  private held = ""; // a short sentence waiting to go out with the next one

  // minChars: shorter sentences are joined to the next one. For Gemini, where every call
  // takes ~1.5 s: "Great." plays for 1 s, so the next sentence wouldn't be ready in time
  constructor(private readonly minChars = 0) {}

  private join(sentences: string[], last = false): string[] {
    const out: string[] = [];
    for (const sentence of sentences) {
      const joined = this.held ? `${this.held} ${sentence}` : sentence;
      this.held = "";
      if (joined.length < this.minChars && !last) {
        this.held = joined;
      } else {
        out.push(joined);
      }
    }
    return out;
  }

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

    return this.join(sentences.map(speakable).filter(Boolean));
  }

  // the reply is complete
  flush(): string[] {
    const rest = speakable(this.buffer);
    this.buffer = "";
    const out = this.join(rest ? [rest] : [], true);
    if (this.held) out.push(this.held); // nothing came after it
    this.held = "";
    return out;
  }
}
