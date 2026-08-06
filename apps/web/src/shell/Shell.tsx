// The frame the whole app sits in.
//
// Wide, the rooms stand in a rail down the left, where a reader can see all
// of them at once and see how much is in each. Narrow, they become a bar
// along the bottom, where thumbs are. One at a time, never both — the old
// shell drew the same row at the top *and* the bottom of every screen, which
// is two of the same thing arguing about which is the navigation.
//
// Reading opts out entirely: a book gets the whole page.
import type { ReactNode } from "react";
import { Link } from "../router/router";
import { usePath } from "../router/context";
import { useCounts } from "./useCounts";
import "./shell.css";

const ROOMS = [
  { to: "/", label: "Shelf" },
  { to: "/library", label: "Library" },
  { to: "/play", label: "Play" },
  { to: "/words", label: "Words" },
] as const;

/** Which room a screen belongs to, even when its own path is deeper: a book
 *  and its reader belong to the Library, a game belongs to Play. */
function roomOf(path: string): string {
  if (path.startsWith("/book")) return "/library";
  if (path.startsWith("/play")) return "/play";
  if (path.startsWith("/words")) return "/words";
  if (path.startsWith("/library")) return "/library";
  if (path.startsWith("/settings")) return "/settings";
  return "/";
}

/** A round in progress keeps only its own way back. The rooms — and their
 *  counts — are four exits shouting at somebody in the middle of thinking, so
 *  while a game is on, the shell stands down. */
function inPlay(path: string): boolean {
  return path === "/play/rhyme" || path === "/play/association" || path === "/play/prose";
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePath();
  const counts = useCounts(path);
  const here = roomOf(path);

  if (inPlay(path)) return <div className="shell shell--bare">{children}</div>;

  // A count of nothing tells a reader nothing, and an empty room should not
  // advertise how empty it is.
  const say = (n: number | null) => (n === null || n === 0 ? "" : String(n));
  const aside: Record<string, string> = {
    "/": say(counts.shelf),
    "/library": say(counts.library),
    "/play": "3",
    "/words": say(counts.words),
  };

  return (
    <div className="shell">
      <aside className="shell__rail" aria-label="Rooms">
        <Link to="/" className="shell__wordmark">
          <span className="shell__pip" aria-hidden="true" />
          <span>Superb</span>
        </Link>
        {ROOMS.map((room) => (
          <Link
            key={room.to}
            to={room.to}
            className={`shell__room${here === room.to ? " shell__room--on" : ""}`}
            aria-current={here === room.to ? "page" : undefined}
          >
            <span className="shell__mark" aria-hidden="true" />
            <span className="shell__label">{room.label}</span>
            <span className="shell__aside">{aside[room.to]}</span>
          </Link>
        ))}
        <div className="shell__foot">
          <div className="rule-dotted" />
          <Link
            to="/settings"
            className={`shell__room${here === "/settings" ? " shell__room--on" : ""}`}
            aria-current={here === "/settings" ? "page" : undefined}
          >
            <span className="shell__mark" aria-hidden="true" />
            <span className="shell__label">Settings</span>
          </Link>
        </div>
      </aside>

      <main className="shell__main">{children}</main>

      <nav className="shell__tabs" aria-label="Rooms">
        {ROOMS.map((room) => (
          <Link
            key={room.to}
            to={room.to}
            className={`shell__tab${here === room.to ? " shell__tab--on" : ""}`}
            aria-current={here === room.to ? "page" : undefined}
          >
            <span className="shell__mark" aria-hidden="true" />
            {room.label}
          </Link>
        ))}
        <Link
          to="/settings"
          className={`shell__tab${here === "/settings" ? " shell__tab--on" : ""}`}
          aria-current={here === "/settings" ? "page" : undefined}
        >
          <span className="shell__mark" aria-hidden="true" />
          More
        </Link>
      </nav>
    </div>
  );
}

/** The scrolling column every room's content sits in. `width` widens or
 *  narrows the measure: a library grid wants more room than one book does. */
export function Room({
  children,
  width = "wide",
  className,
}: {
  /** Absent while a room is still loading: the column keeps its shape so
   *  nothing jumps when the content arrives. */
  children?: ReactNode;
  width?: "wide" | "page" | "narrow";
  className?: string;
}) {
  return (
    <div className="room">
      <div className={`room__column room__column--${width}${className ? ` ${className}` : ""}`}>{children}</div>
    </div>
  );
}
