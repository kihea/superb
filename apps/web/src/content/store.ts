// The shell's content store (docs/seams.md: "the shell answers this from its
// content store and hands the answer straight back"). It never ranks or
// filters on the engine's behalf -- it just knows what exists and can fetch
// a record by id.
import type { Candidate, ContentFrame } from "../engine/port";
import type { ComposedPassage, SourceExcerpt, WordClass } from "./types";

export type Record_ = ComposedPassage | SourceExcerpt;

let byId: Map<string, Record_> | null = null;
let lexicon: { wordClasses: Record<string, string[]>; bandWords: string[] } | null = null;

// A corpus-sized JSON file (T3b's 2,600-excerpt sources.json is 2.79 MB, and
// workspace/contract.md targets it growing further) is too large to rely on
// the service worker's precache for, and workbox's runtime caching only
// intercepts requests once the worker is actively controlling the page --
// which the very first load, before anyone has gone offline, is not
// guaranteed to be. Caching it here instead, explicitly, with the Cache API
// directly: no dependency on service-worker timing, works the moment this
// module has run once online, regardless of whether a worker exists at all.
const CONTENT_CACHE = "superb-content-v1";

async function fetchJson<T>(url: string): Promise<T> {
  if (!("caches" in window)) return fetch(url).then((r) => r.json() as Promise<T>);

  const cache = await caches.open(CONTENT_CACHE);
  try {
    const response = await fetch(url);
    if (response.ok) await cache.put(url, response.clone());
    return (await response.json()) as T;
  } catch (networkError) {
    const cached = await cache.match(url);
    if (cached) return (await cached.json()) as T;
    throw networkError;
  }
}

async function ensureLoaded(): Promise<Map<string, Record_>> {
  if (byId) return byId;
  const [passages, sources] = await Promise.all([
    fetchJson<ComposedPassage[]>("/content/passages.json"),
    fetchJson<SourceExcerpt[]>("/content/sources.json"),
  ]);
  const map = new Map<string, Record_>();
  for (const p of passages) map.set(p.id, p);
  for (const s of sources) map.set(s.id, s);
  byId = map;
  return map;
}

/** `ContentFrame.wordClasses`/`bandWords` -- straight from
 *  `content/classes/*.json`, docs/seams.md's own words for where this comes
 *  from. Without it, `superb-core::composer::fill_slots` cannot place any
 *  word into a composed slot at all (no due list, no band words to seed
 *  with), and a fresh reader's first passage never resolves -- exactly the
 *  gap the mock engine hid, because the mock filled every slot with
 *  `defaultWord` and never asked the lexicon anything.
 *
 *  **`bandWords`'s order is not yet calibrated to θ.** docs/seams.md says
 *  this ranking is "a corpus property (frequency, how informative the
 *  contexts are)" -- it is not, today: each class's own member list reads
 *  roughly common-to-rare (`content/classes/_seed.py`'s own ordering), but
 *  nothing maps that to the numeric `[bandLow, bandHigh]` window `Needs
 *  ::PassageCandidates` carries, and this store does not read that window
 *  at all yet. Flattening every class in id order, preserving each list's
 *  own internal order, is a real ranking (not arbitrary) but an
 *  admittedly crude stand-in for the frequency-calibrated one T3b's
 *  content pipeline should eventually own. Recorded here rather than
 *  smoothed over: this is real friction the mock engine hid, not a
 *  finished feature. */
async function ensureLexiconLoaded(): Promise<{ wordClasses: Record<string, string[]>; bandWords: string[] }> {
  if (lexicon) return lexicon;
  const classes = await fetchJson<WordClass[]>("/content/classes.json");
  const sorted = [...classes].sort((a, b) => a.id.localeCompare(b.id));

  const wordClasses: Record<string, string[]> = {};
  const bandWords: string[] = [];
  for (const cls of sorted) {
    for (const word of cls.members) {
      (wordClasses[word] ??= []).push(cls.id);
      bandWords.push(word);
    }
  }
  lexicon = { wordClasses, bandWords };
  return lexicon;
}

/** Resolve a Passage effect's id back into the full record the shell needs
 *  to render -- the engine's Passage type carries fills, not text. */
export async function resolve(id: string): Promise<Record_> {
  const map = await ensureLoaded();
  const record = map.get(id);
  if (!record) throw new Error(`content store has no record for "${id}"`);
  return record;
}

/** ADR-022, docs/seams.md's second same-day amendment: Seam 2 gives a
 *  record a single topic string; Seam 1 wants a list. This is the one
 *  place that mapping happens, so three tracks do not each invent it
 *  differently. A composed passage always has one; a sourced excerpt might
 *  not yet (T3b is backfilling) -- missing is legal, not an error. */
function topicsOf(record: Record_): string[] {
  return record.topic ? [record.topic] : [];
}

/** Answers a PassageTopics Needs -- what a PassageFinished/PassageAbandoned
 *  needs looked up before the engine can update its affinity tally. */
export async function topicsFor(id: string): Promise<string[]> {
  const map = await ensureLoaded();
  const record = map.get(id);
  return record ? topicsOf(record) : [];
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

/** The ranking itself, pulled out of `candidatesFor` so it can be tested
 *  without a network fetch (`tests/candidates-ranking.test.ts`) -- and so
 *  that test can hold the M2 contract's item 5b tripwire to something more
 *  than a comment: **curated-then-shuffled order depends only on `id`,
 *  never on a record's `words` or `slots` content.** That is the property
 *  this function must keep true for the real corpus, since nothing else
 *  downstream checks it -- `superb-core`'s composer is the only thing
 *  allowed to read `Candidate.words` as a scheduling input, and only this
 *  function decides what order the engine ever sees candidates in. */
export function rankCandidates(records: Record_[], exclude: Set<string>): Record_[] {
  const remaining = records.filter((r) => !exclude.has(r.id));
  const pool = remaining.length > 0 ? remaining : records;

  const curated = pool.filter((r) => CURATED_FIRST.includes(r.id));
  curated.sort((a, b) => CURATED_FIRST.indexOf(a.id) - CURATED_FIRST.indexOf(b.id));
  const rest = shuffled(pool.filter((r) => !CURATED_FIRST.includes(r.id)));

  return [...curated, ...rest];
}

function toCandidate(r: Record_): Candidate {
  return r.pool === "composed"
    ? { id: r.id, pool: "Composed", slots: r.slots, words: [], topics: topicsOf(r) }
    : {
        id: r.id,
        pool: "Sourced",
        slots: [],
        // ADR-026: content/sources' `words` carries {word, signals}
        // objects now. The engine's Candidate only ever needed the word
        // itself -- signals are an audit-trail concern downstream of
        // scheduling, not a scheduling input.
        words: r.words.map((w) => w.word),
        topics: topicsOf(r),
      };
}

/** Answers a PassageCandidates Needs. `exclude` keeps a session from
 *  immediately repeating what was just read. The band and due-word
 *  parameters are the engine's; this store does not use them to rank
 *  (that is a corpus-frequency judgment the real content pipeline owns) --
 *  it returns curated-first, best first, matching what the seam says a real
 *  content store's ranking is for. */
export async function candidatesFor(exclude: Set<string>): Promise<ContentFrame> {
  const [map, { wordClasses, bandWords }] = await Promise.all([ensureLoaded(), ensureLexiconLoaded()]);
  const ranked = rankCandidates([...map.values()], exclude);

  return {
    candidates: ranked.map(toCandidate),
    wordClasses,
    bandWords,
  };
}
