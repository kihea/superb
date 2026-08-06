// What the rail says beside each room. Small numbers, loaded once, and
// deliberately quiet: they tell a reader how much is in a room, not how well
// they are doing in it.
import { useEffect, useState } from "react";
import { getShelf } from "../reading/bookState";
import { getKeptWords } from "../reading/words";
import { loadIndex } from "../content/catalogue";

export interface RoomCounts {
  shelf: number | null;
  library: number | null;
  words: number | null;
}

/** The rail re-reads these when the path changes, which is the only moment
 *  any of them can have moved without this component being remounted. */
export function useCounts(path: string): RoomCounts {
  const [counts, setCounts] = useState<RoomCounts>({ shelf: null, library: null, words: null });

  useEffect(() => {
    let live = true;
    Promise.all([
      getShelf().catch(() => []),
      getKeptWords().catch(() => []),
      loadIndex().catch(() => []),
    ]).then(([shelf, words, index]) => {
      if (!live) return;
      setCounts({ shelf: shelf.length, library: index.length, words: words.length });
    });
    return () => {
      live = false;
    };
  }, [path]);

  return counts;
}
