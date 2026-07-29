// The shell's persistence. A single opaque string in, a single opaque string
// out -- the shell never parses what the engine saves (docs/seams.md).
// IndexedDB rather than localStorage because the serialized LearnerState has
// no promised size ceiling and localStorage's ~5MB synchronous API is the
// wrong tool to find that out the hard way.
const DB_NAME = "superb-web";
const STORE = "engine";
const KEY = "state";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadState(): Promise<string | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveState(document: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(document, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// The shell's own "what did I just show" list -- kept separate from KEY
// above on purpose. docs/seams.md: "the shell persists the bytes and never
// reads inside them." mockEngine.ts used to smuggle this list inside its own
// serialized state (`seenIds()` parsed `engine.save()` back open), which
// only worked because the mock owned that JSON shape outright. The real
// LearnerState's document is superb-core's, opaque to this app -- so the
// exclusion list a session needs to avoid repeating what it just read has
// to live in its own key, never inside the engine's bytes.
const RECENT_KEY = "recentPassages";

export async function loadRecentPassages(): Promise<string[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(RECENT_KEY);
    req.onsuccess = () => resolve((req.result as string[] | undefined) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecentPassages(ids: string[]): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(ids, RECENT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// The passage on screen right now, if any -- also shell-owned, for the same
// reason RECENT_KEY is (superb-core's LearnerState has no concept of "a
// passage in flight"; it only learns about one once PassageFinished or
// PassageAbandoned arrives). Without this, a reload has nothing to resume
// mid-passage with and calls NextPassage again, composing a different one
// every time the page reloads -- the mock engine used to hide this because
// it kept its own `state.current` and returned it verbatim from a second
// plan() call; the real engine has no such call to make, because knowing
// what is still on screen is the shell's own concern, not the schedule's.
const CURRENT_KEY = "currentPassage";

export async function loadCurrentPassage<T>(): Promise<T | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(CURRENT_KEY);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCurrentPassage<T>(passage: T): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(passage, CURRENT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
