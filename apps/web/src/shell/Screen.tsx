// The frame every non-reading screen sits in: a way back, the name of the
// room, the room, and -- where the frames show one -- the tab bar. Reading
// does not use this; a passage gets the whole page (3a).
import type { ReactNode } from "react";
import "./surface.css";
import { Link } from "../router/router";
import { TabBar } from "./TabBar";

export interface ScreenProps {
  /** Shown centred in the top row. Omit for screens with no title (1s, 3b). */
  title?: string;
  /** Where the left-hand word goes, and what it says. */
  back?: { to: string; label: string };
  /** Anything that sits opposite the back link -- an orb, a count. */
  trail?: ReactNode;
  /** 2g and 1h stand on the sunken paper rather than the page paper. */
  sunken?: boolean;
  tabs?: boolean;
  /** Screens that lay out their own body edge to edge (a challenge board
   *  with a fixed answer row) opt out of the padded column. */
  bare?: boolean;
  children: ReactNode;
}

export function Screen({ title, back, trail, sunken, tabs, bare, children }: ScreenProps) {
  const hasTopBar = Boolean(title || back || trail);
  return (
    <div className={`sb-screen${sunken ? " sb-screen--sunken" : ""}`}>
      {hasTopBar && (
        <header className="sb-topbar">
          {back ? (
            <Link to={back.to} className="sb-quiet">
              {back.label}
            </Link>
          ) : (
            <span className="sb-topbar__trail" />
          )}
          {title ? <h1 className="sb-topbar__title">{title}</h1> : <span style={{ flex: 1 }} />}
          <span className="sb-topbar__trail">{trail}</span>
        </header>
      )}
      {bare ? children : <div className="sb-body">{children}</div>}
      {tabs && <TabBar />}
    </div>
  );
}
