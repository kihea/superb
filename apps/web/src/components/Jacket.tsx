// A book as a set piece of type: the title dressed in one of ten jacket
// styles, the author beneath it, and nothing else. The same book always
// wears the same jacket and the same cloth — the hash is the bindery.
//
// This replaces the library's cover-thumbnail-plus-detail row. A wall of
// identical covers read as inventory; a wall of set titles reads as a
// bookshop window.
import "./Jacket.css";
import type { CoverBook } from "./Cover";

export interface JacketBook {
  title: string;
  author: string;
  cloth: CoverBook["cloth"];
}

export const JACKET_STYLES = 10;

/** The same book always wears the same jacket. Same shape as clothFor,
 *  different multiplier so cloth and jacket don't travel in lockstep. */
export function jacketFor(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 37 + ch.charCodeAt(0)) >>> 0;
  return hash % JACKET_STYLES;
}

/** Stacked styles break the title one word a line; long words still wrap. */
function stackedLines(title: string): string[] {
  const words = title.split(" ");
  if (words.length <= 6) return words;
  // Past six words a strict stack turns into a chimney; pair them up.
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += 2) {
    lines.push(words.slice(i, i + 2).join(" "));
  }
  return lines;
}

export function Jacket({
  book,
  styleIndex,
  onClick,
}: {
  book: JacketBook;
  styleIndex: number;
  onClick?: () => void;
}) {
  const style = ((styleIndex % JACKET_STYLES) + JACKET_STYLES) % JACKET_STYLES;
  const stacked = style === 3;
  return (
    <button
      type="button"
      className={`jacket jacket--s${style} jacket--${book.cloth}`}
      onClick={onClick}
    >
      <span className="jacket__title">
        {stacked
          ? stackedLines(book.title).map((line, i) => (
              <span key={i} className="jacket__line">
                {line}
              </span>
            ))
          : book.title}
      </span>
      <span className="jacket__author">{book.author}</span>
    </button>
  );
}
