// The shell's content store (docs/seams.md: "the shell answers this from its
// content store and hands the answer straight back"). It never ranks or
// filters on the engine's behalf -- it just knows what exists and can fetch
// a record by id.
import type { Candidate, ContentFrame } from "../engine/port";
import type { ComposedPassage, SourceExcerpt } from "./types";

type Record_ = ComposedPassage | SourceExcerpt;

let byId: Map<string, Record_> | null = null;

async function ensureLoaded(): Promise<Map<string, Record_>> {
  if (byId) return byId;
  const [passages, sources] = await Promise.all([
    fetch("/content/passages.json").then((r) => r.json() as Promise<ComposedPassage[]>),
    fetch("/content/sources.json").then((r) => r.json() as Promise<SourceExcerpt[]>),
  ]);
  const map = new Map<string, Record_>();
  for (const p of passages) map.set(p.id, p);
  for (const s of sources) map.set(s.id, s);
  byId = map;
  return map;
}

/** Resolve a Passage effect's id back into the full record the shell needs
 *  to render -- the engine's Passage type carries fills, not text. */
export async function resolve(id: string): Promise<Record_> {
  const map = await ensureLoaded();
  const record = map.get(id);
  if (!record) throw new Error(`content store has no record for "${id}"`);
  return record;
}

// This mock's fixture glosses (src/fixtures/glosses.ts) were hand-written
// for these ids first, so a fresh session sees fully-glossed content before
// it ever reaches the long tail where a gloss tap falls back to a generic
// line. This is a rotation preference, not invented content -- every id
// below is a real, unaltered passage or excerpt already on disk.
const CURATED_FIRST = [
  "comp-harbour-dawn",
  "comp-harbour-departure",
  "comp-harbour-evening-return",
  "comp-harbour-fish-market",
  "src-austen-emma-woodhouse",
  "src-austen-sir-walter-elliot",
  "src-austen-truth-universally-acknowledged",
  "src-alcott-jo-rummaging",
  "src-burnett-mary-lennox",
  "src-carroll-alice-was-beginning",
  "src-cather-last-summer-i-happened",
  "src-chopin-a-green-and-yellow-parrot",
  "src-conrad-we-live-as-we-dream-alone",
  "src-defoe-i-smiled-to-myself",
  "src-defoe-i-was-born-in-the-year-1632",
  "src-dickens-family-name-being-pirrip",
  "src-dickens-little-world-in-which-children",
  "src-dickens-whether-i-shall-turn-out",
  "src-dickens-best-of-times",
  "src-dostoevsky-i-am-a-sick-man",
  "src-dostoevsky-on-an-exceptionally-hot-evening",
  "src-douglass-i-was-born-in-tuckahoe",
  "src-dubois-between-me-and-the-other-world",
  "src-hawthorne-a-throng-of-bearded-men",
  "src-london-buck-did-not-read",
  "src-montgomery-avonlea-main-road",
  "src-stevenson-squire-trelawney",
  "src-stevenson-utterson-the-lawyer",
  "src-swift-my-father-had-a-small-estate",
  "src-swift-utmost-astonishment",
  "src-tolstoy-happy-families",
  "src-twain-tom-no-answer",
  "src-wharton-i-had-the-story-bit-by-bit",
  "src-wilde-the-artist-is-the-creator",
  "src-stoker-the-dead-travel-fast",
  "src-bronte-c-no-possibility-of-taking-a-walk",
  "src-bronte-e-i-lingered-round-them",
  "src-james-the-story-had-held-us",
];

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Answers a PassageCandidates Needs. `exclude` keeps a session from
 *  immediately repeating what was just read. The band and due-word
 *  parameters are the engine's; this mock store does not use them to rank
 *  (that is a corpus-frequency judgment the real content pipeline owns) --
 *  it returns curated-first, best first, matching what the seam says a real
 *  content store's ranking is for. */
export async function candidatesFor(exclude: Set<string>): Promise<ContentFrame> {
  const map = await ensureLoaded();
  const remaining = [...map.values()].filter((r) => !exclude.has(r.id));
  const pool = remaining.length > 0 ? remaining : [...map.values()];

  const curated = pool.filter((r) => CURATED_FIRST.includes(r.id));
  curated.sort((a, b) => CURATED_FIRST.indexOf(a.id) - CURATED_FIRST.indexOf(b.id));
  const rest = shuffled(pool.filter((r) => !CURATED_FIRST.includes(r.id)));

  const candidates: Candidate[] = [...curated, ...rest].map((r) =>
    r.pool === "composed"
      ? { id: r.id, pool: "Composed", slots: r.slots, words: [] }
      : { id: r.id, pool: "Sourced", slots: [], words: r.words },
  );

  return {
    candidates,
    // The mock always fills composed slots with defaultWord (seams.md: it
    // "must read naturally with any legal fill"), so it never needs the
    // class->word lexicon a real scheduler would consult here.
    wordClasses: {},
    bandWords: [],
  };
}
