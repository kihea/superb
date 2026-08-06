// The Goodreads door, both ways.
//
// This is the one place in the app where somebody's own writing arrives from
// outside, so the parser has to survive what Goodreads actually exports:
// reviews with commas, quotes and newlines in them, a BOM at the head of the
// file, titles carrying series and edition tails, and authors written
// surname-first in one column and forename-first in another. A parser that
// splits on commas would silently truncate a third of a reader's reviews and
// nobody would notice until they went looking for one.
import { describe, expect, it } from "vitest";
import {
  applyImport,
  matchRows,
  parseCsv,
  readGoodreadsCsv,
  toGoodreadsCsv,
  type GoodreadsRow,
} from "../src/reading/goodreads";
import type { CatalogueIndexRow } from "../src/content/catalogue";

const LIBRARY: CatalogueIndexRow[] = [
  {
    id: "bram-stoker_dracula",
    title: "Dracula",
    author: "Bram Stoker",
    language: "en-GB",
    wordCount: 160775,
    chapterCount: 27,
    chapterLabels: ["I"],
    categories: ["Fiction", "Mystery & Horror"],
    shape: "prose",
  },
  {
    id: "jane-austen_pride-and-prejudice",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    language: "en-GB",
    wordCount: 122189,
    chapterCount: 61,
    chapterLabels: ["I"],
    categories: ["Fiction"],
    shape: "prose",
  },
  // Two books with the same title by different authors: the matcher must not
  // guess between them on the title alone.
  {
    id: "marcus-aurelius_meditations_george-long",
    title: "Meditations",
    author: "Marcus Aurelius",
    language: "en-US",
    wordCount: 60000,
    chapterCount: 12,
    chapterLabels: ["I"],
    categories: ["Philosophy"],
    shape: "prose",
  },
  {
    id: "rene-descartes_meditations_john-veitch",
    title: "Meditations",
    author: "René Descartes",
    language: "en-US",
    wordCount: 30000,
    chapterCount: 6,
    chapterLabels: ["I"],
    categories: ["Philosophy"],
    shape: "prose",
  },
];

describe("parseCsv", () => {
  it("keeps commas, newlines and doubled quotes inside a quoted cell", () => {
    const table = parseCsv('a,b\n"one, two","he said ""no""\nand left"\n');
    expect(table).toEqual([
      ["a", "b"],
      ["one, two", 'he said "no"\nand left'],
    ]);
  });

  it("reads CRLF the way a Windows export writes it", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("does not let a BOM become part of the first column's name", () => {
    const table = parseCsv("﻿Title,Author\nDracula,Bram Stoker\n");
    expect(table[0][0]).toBe("Title");
  });
});

describe("readGoodreadsCsv", () => {
  const csv = [
    'Book Id,Title,Author,Author l-f,My Rating,Average Rating,Publisher,My Review,Exclusive Shelf,Date Read,Read Count',
    '17245,"Dracula (Norton Critical Editions)",Bram Stoker,"Stoker, Bram",5,4.01,Norton,"Best in the first four chapters, sags in the middle.",read,2024/03/11,2',
    '1885,Pride and Prejudice,Jane Austen,"Austen, Jane",,4.28,Penguin,,to-read,,',
    '99999,Some Book Not Here,A. Nobody,"Nobody, A.",3,3.10,Self,,read,2023/01/01,1',
  ].join("\r\n");

  it("reads the columns it needs by name, whatever order they are in", () => {
    const rows = readGoodreadsCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      title: "Dracula (Norton Critical Editions)",
      author: "Bram Stoker",
      myRating: 5,
      averageRating: 4.01,
      shelf: "read",
      readCount: 2,
    });
    expect(rows[0].myReview).toContain("sags in the middle");
  });

  it("treats an unrated, unreviewed row as unrated rather than as zero stars", () => {
    const rows = readGoodreadsCsv(csv);
    expect(rows[1].myRating).toBe(0);
    expect(rows[1].myReview).toBeUndefined();
  });

  it("returns nothing at all for a file that is not a Goodreads export", () => {
    expect(readGoodreadsCsv("name,email\nada,ada@example.com\n")).toEqual([]);
  });

  describe("matchRows", () => {
    it("matches through a series or edition tail on the title", () => {
      const result = matchRows(readGoodreadsCsv(csv), LIBRARY);
      expect(result.matched.map((m) => m.book.id)).toContain("bram-stoker_dracula");
    });

    it("reports a book this library does not have rather than guessing", () => {
      const result = matchRows(readGoodreadsCsv(csv), LIBRARY);
      expect(result.unmatched.map((r) => r.title)).toEqual(["Some Book Not Here"]);
    });

    it("uses the author to choose between two books of the same title", () => {
      const rows: GoodreadsRow[] = [{ title: "Meditations", author: "Aurelius, Marcus", myRating: 5 }];
      const result = matchRows(rows, LIBRARY);
      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].book.id).toBe("marcus-aurelius_meditations_george-long");
    });

    it("refuses to choose when the title is shared and the author does not agree", () => {
      const rows: GoodreadsRow[] = [{ title: "Meditations", author: "Someone Else", myRating: 5 }];
      const result = matchRows(rows, LIBRARY);
      expect(result.matched).toHaveLength(0);
      expect(result.unmatched).toHaveLength(1);
    });
  });
});

describe("applyImport", () => {
  const now = 1_700_000_000_000;
  const result = matchRows(
    [
      { title: "Dracula", author: "Stoker, Bram", myRating: 5, averageRating: 4.01, myReview: "Theirs.", shelf: "read" },
      { title: "Pride and Prejudice", author: "Austen, Jane", myRating: 4, shelf: "to-read" },
    ],
    LIBRARY,
  );

  it("brings ratings, reviews and shelves in", () => {
    const next = applyImport(result, {}, [], now);
    expect(next.marks["bram-stoker_dracula"]).toMatchObject({ stars: 5, review: "Theirs." });
    expect(next.marks["bram-stoker_dracula"].imported).toMatchObject({ from: "goodreads", averageRating: 4.01 });
    expect(next.shelf.find((e) => e.bookId === "bram-stoker_dracula")?.finishedAt).toBe(now);
    // "to-read" belongs on the shelf too — that is what a shelf is for — but
    // it is not finished.
    expect(next.shelf.find((e) => e.bookId === "jane-austen_pride-and-prejudice")?.finishedAt).toBeUndefined();
  });

  it("never overwrites what the reader wrote here", () => {
    const mine = {
      "bram-stoker_dracula": { bookId: "bram-stoker_dracula", stars: 2, review: "Mine.", updatedAt: 1 },
    };
    const next = applyImport(result, mine, [], now);
    expect(next.marks["bram-stoker_dracula"]).toMatchObject({ stars: 2, review: "Mine." });
    // The import is still recorded, so the page can say where the Goodreads
    // average came from.
    expect(next.marks["bram-stoker_dracula"].imported?.averageRating).toBe(4.01);
  });

  it("does not add a book to the shelf twice", () => {
    const shelf = [{ bookId: "bram-stoker_dracula", addedAt: 5 }];
    const next = applyImport(result, {}, shelf, now);
    expect(next.shelf.filter((e) => e.bookId === "bram-stoker_dracula")).toHaveLength(1);
  });
});

describe("toGoodreadsCsv", () => {
  it("writes a file Goodreads' own importer would read, and quotes what needs it", () => {
    const csv = toGoodreadsCsv(
      {
        "bram-stoker_dracula": {
          bookId: "bram-stoker_dracula",
          stars: 5,
          review: 'Commas, quotes "and" newlines\nall survive.',
          updatedAt: 1,
        },
      },
      [{ bookId: "bram-stoker_dracula", addedAt: 1_600_000_000_000, finishedAt: 1_700_000_000_000 }],
      LIBRARY,
    );

    const table = parseCsv(csv);
    expect(table[0]).toContain("My Rating");
    expect(table[1][0]).toBe("Dracula");
    expect(table[1][2]).toBe("5");
    expect(table[1][4]).toBe('Commas, quotes "and" newlines\nall survive.');
    expect(table[1][5]).toBe("read");
  });

  it("leaves out books the reader has neither marked nor shelved", () => {
    const csv = toGoodreadsCsv({}, [], LIBRARY);
    expect(parseCsv(csv)).toHaveLength(1);
  });

  it("survives a round trip", () => {
    const marks = {
      "jane-austen_pride-and-prejudice": {
        bookId: "jane-austen_pride-and-prejudice",
        stars: 4,
        review: "Read for the romance, stay for the sentences.",
        updatedAt: 1,
      },
    };
    const csv = toGoodreadsCsv(marks, [{ bookId: "jane-austen_pride-and-prejudice", addedAt: 1 }], LIBRARY);
    const back = matchRows(readGoodreadsCsv(csv), LIBRARY);
    expect(back.matched).toHaveLength(1);
    expect(back.matched[0].row.myRating).toBe(4);
    expect(back.matched[0].row.myReview).toBe("Read for the romance, stay for the sentences.");
  });
});
