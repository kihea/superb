// A book as an object you could pick up (1h). The cloth colour is a
// property of the book in v0mock rather than anything derived, so a shelf
// looks like a shelf and not like a chart.
import type { MockBook } from "../v0mock";
import "./Cover.css";

export interface CoverProps {
  book: MockBook;
  /** `lg` is the current book on the Shelf, `xl` the one on a book's own page. */
  size?: "sm" | "md" | "lg" | "xl";
  /** Frosted, not faded -- 1h's own note. */
  finished?: boolean;
  onClick?: () => void;
}

export function Cover({ book, size = "md", finished, onClick }: CoverProps) {
  const className = [
    "sb-cover",
    "cover",
    `cover--${size}`,
    `sb-cover--${book.cloth}`,
    finished ? "sb-cover--finished" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Frame 2g puts only the title on a library cover; the author belongs to
  // the metadata line beside the card, where it already is. Putting both on
  // a 70x100 cover is what cut eight of eleven titles mid-word.
  const inside = (
    <>
      <span className="cover__title">{book.title}</span>
      {size !== "sm" && <span className="sb-cover__author">{book.author}</span>}
    </>
  );

  if (!onClick) {
    return (
      <div className={className} aria-hidden="true">
        {inside}
      </div>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {inside}
    </button>
  );
}
