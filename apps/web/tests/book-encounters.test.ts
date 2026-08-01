// ADR-031's safety gate, made mechanical: a book encounter is recorded and
// consumes nothing. `fake-indexeddb` stands in for the browser's IndexedDB
// the same way engine-persistence.test.ts already uses it -- a polyfill of
// the real API storage/db.ts calls, not a reimplementation of db.ts itself.
import "fake-indexeddb/auto";
import { describe, expect, test } from "vitest";
import { loadState, saveState } from "../src/storage/db";
import { getEncounters, getPlace, recordEncounter, resetBookReadingState, setPlace } from "../src/reading/bookState";

describe("book reading state", () => {
  test("records an encounter with the required identifiers and a timestamp the caller supplied", async () => {
    const encounter = await recordEncounter(
      { bookId: "bram-stoker_dracula", partIndex: 0, blockIndex: 3, word: "tranquil", context: "The night was tranquil." },
      1_700_000_000_000,
    );
    expect(encounter.word).toBe("tranquil");
    expect(encounter.at).toBe(1_700_000_000_000);

    const stored = await getEncounters("bram-stoker_dracula");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ bookId: "bram-stoker_dracula", partIndex: 0, blockIndex: 3, word: "tranquil" });
  });

  test("never touches the engine's own persisted state -- recording is a separate store", async () => {
    await saveState('{"marker":"untouched-by-book-reading"}');
    for (let i = 0; i < 5; i++) {
      await recordEncounter(
        { bookId: "bram-stoker_dracula", partIndex: 0, blockIndex: i, word: `word${i}`, context: "..." },
        1_700_000_000_000 + i,
      );
    }
    await setPlace({ bookId: "bram-stoker_dracula", partIndex: 2, blockIndex: 7, updatedAt: Date.now() });

    expect(await loadState()).toBe('{"marker":"untouched-by-book-reading"}');
  });

  test("place is resumable and scoped to the book it was saved for", async () => {
    await setPlace({ bookId: "bram-stoker_dracula", partIndex: 1, blockIndex: 4, updatedAt: 123 });
    expect(await getPlace("bram-stoker_dracula")).toMatchObject({ partIndex: 1, blockIndex: 4 });
    expect(await getPlace("some-other-book")).toBeNull();
  });

  test("a place saved under a different shape than expected is treated as absent, not as a crash", async () => {
    // Simulates a future schema change or a partially-written record --
    // getPlace() is the load half of "corrupt local state produces a
    // recoverable screen and never silently discards data": recoverable
    // here means the book just starts from its first page, not that the
    // read throws.
    const { saveBookPlace } = await import("../src/storage/db");
    await saveBookPlace({ bookId: "bram-stoker_dracula", partIndex: "not-a-number" });
    expect(await getPlace("bram-stoker_dracula")).toBeNull();
  });

  test("start-over clears place and the encounter log without touching the engine", async () => {
    await saveState('{"marker":"still-untouched"}');
    await setPlace({ bookId: "bram-stoker_dracula", partIndex: 3, blockIndex: 9, updatedAt: 1 });
    await recordEncounter({ bookId: "bram-stoker_dracula", partIndex: 3, blockIndex: 9, word: "x", context: "x" }, 1);

    await resetBookReadingState();

    expect(await getPlace("bram-stoker_dracula")).toBeNull();
    expect(await getEncounters("bram-stoker_dracula")).toHaveLength(0);
    expect(await loadState()).toBe('{"marker":"still-untouched"}');
  });
});
