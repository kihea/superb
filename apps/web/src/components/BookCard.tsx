// A book, as a tile.
//
// The art is the plate and the plate is the whole left edge of the card, full
// height. Two carved letters hold still so a shelf reads at a glance; the
// title runs along the foot of the grid as a marquee once you look at it. The
// readable title sits to the side, the author sits at the bottom, and the
// category's colour is in the carving rather than in a fill — so a row of
// eight books reads as eight different books instead of a paint chart.
import { PlateTile } from "./Plate";
import { useLive } from "./useLive";
import { genreOf } from "../content/genre";
import "./BookCard.css";

export interface BookCardBook {
  id: string;
  title: string;
  author: string;
  categories?: string[];
}

export function BookCard({ book, onClick }: { book: BookCardBook; onClick: () => void }) {
  const { live, liveProps } = useLive();
  return (
    <button type="button" className="book-card" onClick={onClick} {...liveProps}>
      <span className="book-card__art">
        <PlateTile seed={book.title} kind={genreOf(book)} cols={24} rows={13} size={8.5} live={live} />
      </span>
      <span className="book-card__side">
        <span className="book-card__title">{book.title}</span>
        <span className="book-card__author">{book.author}</span>
      </span>
    </button>
  );
}
