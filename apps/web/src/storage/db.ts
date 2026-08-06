// The shell's persistence. A single opaque string in, a single opaque string
// out -- the shell never parses what the engine saves. IndexedDB rather than
// localStorage because the serialized LearnerState has no promised size
// ceiling and localStorage's ~5MB synchronous API is the wrong tool to find
// that out the hard way.
const DB_NAME = "superb-web";
const STORE = "engine";
const KEY = "state";
// The reader's own things -- shelf, places, kept words -- live in their own
// store rather than inside STORE above. Ordinary reading never touches the
// engine, and giving it a separate store makes "nothing here is ever read
// back into the engine" true by construction: there is no code path from
// BOOK_STORE into wasmEngine.load().
const BOOK_STORE = "book";
const DB_VERSION = 2;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (event.oldVersion < 1) db.createObjectStore(STORE);
      if (event.oldVersion < 2) db.createObjectStore(BOOK_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getFrom<T>(store: string, key: string): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
        req.onerror = () => reject(req.error);
      }),
  );
}

function putTo<T>(store: string, key: string, value: T): Promise<void> {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

// ── The engine's bytes, and the prose session around them ──

export async function loadState(): Promise<string | null> {
  return getFrom<string>(STORE, KEY);
}

export async function saveState(document: string): Promise<void> {
  return putTo(STORE, KEY, document);
}

// The shell's own "what did I just show" list -- kept separate from KEY
// above on purpose: the real LearnerState's document is superb-core's,
// opaque to this app, so the exclusion list a session needs to avoid
// repeating what it just read lives in its own key, never inside the
// engine's bytes.
const RECENT_KEY = "recentPassages";

export async function loadRecentPassages(): Promise<string[]> {
  return (await getFrom<string[]>(STORE, RECENT_KEY)) ?? [];
}

export async function saveRecentPassages(ids: string[]): Promise<void> {
  return putTo(STORE, RECENT_KEY, ids);
}

// The passage on screen right now, if any -- also shell-owned: the engine
// has no concept of "a passage in flight", so without this a reload would
// compose a different passage every time.
const CURRENT_KEY = "currentPassage";

export async function loadCurrentPassage<T>(): Promise<T | null> {
  return getFrom<T>(STORE, CURRENT_KEY);
}

export async function saveCurrentPassage<T>(passage: T): Promise<void> {
  return putTo(STORE, CURRENT_KEY, passage);
}

// ── The reader's own things (BOOK_STORE, see its comment above) ──
const PLACES_KEY = "places";
const SHELF_KEY = "shelf";
const WORDS_KEY = "words";

/** Every book's saved place, keyed by book id -- starting a second book
 *  must never lose the first one's place. */
export async function loadBookPlaces<T>(): Promise<Record<string, T>> {
  return (await getFrom<Record<string, T>>(BOOK_STORE, PLACES_KEY)) ?? {};
}

export async function saveBookPlaces<T>(places: Record<string, T>): Promise<void> {
  return putTo(BOOK_STORE, PLACES_KEY, places);
}

export async function loadShelf<T>(): Promise<T[]> {
  return (await getFrom<T[]>(BOOK_STORE, SHELF_KEY)) ?? [];
}

export async function saveShelf<T>(entries: T[]): Promise<void> {
  return putTo(BOOK_STORE, SHELF_KEY, entries);
}

export async function loadKeptWords<T>(): Promise<T[]> {
  return (await getFrom<T[]>(BOOK_STORE, WORDS_KEY)) ?? [];
}

export async function saveKeptWords<T>(words: T[]): Promise<void> {
  return putTo(BOOK_STORE, WORDS_KEY, words);
}

/** What a reader thought of a book: their own stars and review, and
 *  whatever a Goodreads export brought in with them. Keyed by book id, in
 *  BOOK_STORE with everything else the reader owns — the engine has no
 *  business knowing which books someone liked. */
const MARKS_KEY = "marks";

export async function loadBookMarks<T>(): Promise<Record<string, T>> {
  return (await getFrom<Record<string, T>>(BOOK_STORE, MARKS_KEY)) ?? {};
}

export async function saveBookMarks<T>(marks: Record<string, T>): Promise<void> {
  return putTo(BOOK_STORE, MARKS_KEY, marks);
}

const SENTENCES_KEY = "sentences";

export async function loadKeptSentences<T>(): Promise<T[]> {
  return (await getFrom<T[]>(BOOK_STORE, SENTENCES_KEY)) ?? [];
}

export async function saveKeptSentences<T>(sentences: T[]): Promise<void> {
  return putTo(BOOK_STORE, SENTENCES_KEY, sentences);
}

/** The reset half of "corrupt or unavailable local state produces a
 *  recoverable screen and never silently discards data": an explicit,
 *  reader-initiated action a retry screen calls, never something the app
 *  does on the reader's behalf without asking. */
export async function clearBookState(): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOK_STORE, "readwrite");
    tx.objectStore(BOOK_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
