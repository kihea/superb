// The frame every non-reading screen sits in: the rooms row at both edges,
// a way back, the name of the room, and the room itself. Reading does not
// use this; a passage gets the whole page (3a).
//
// The rooms row is on by default everywhere. The three in-play screens
// (association, rhyme, prose) switch it off with `nav={false}` — a game in
// progress keeps only its own back word, wearing a small arrow.
import type { ReactNode } from "react";
import "./surface.css";
import { Link } from "../router/router";
import { TabBar } from "./TabBar";
import { useHideOnScroll } from "./useHideOnScroll";

export interface ScreenProps {
  /** Shown centred in the top row. Omit for screens with no title (1s, 3b). */
  title?: string;
  /** Where the left-hand word goes, and what it says. `icon` puts a small
   *  back arrow before the word (the in-play screens' request). */
  back?: { to: string; label: string; icon?: boolean };
  /** Anything that sits opposite the back link -- an orb, a count. */
  trail?: ReactNode;
  /** 2g and 1h stand on the sunken paper rather than the page paper. */
  sunken?: boolean;
  /** The rooms row at the screen's edges. Default on; the in-play screens
   *  opt out. */
  nav?: boolean;
  /** Screens that lay out their own body edge to edge (a challenge board
   *  with a fixed answer row) opt out of the padded column. */
  bare?: boolean;
  children: ReactNode;
}

export function Screen({ title, back, trail, sunken, nav = true, bare, children }: ScreenProps) {
  const hasTopBar = Boolean(title || back || trail);
  const navHidden = useHideOnScroll();
  return (
    <div className={`sb-screen${sunken ? " sb-screen--sunken" : ""}${nav ? " sb-screen--nav" : ""}`}>
      {nav && <TabBar edge="top" hidden={navHidden} />}
      {hasTopBar && (
        <header className="sb-topbar">
          {back ? (
            <Link to={back.to} className="sb-quiet">
              {back.icon && (
                <span className="sb-back-arrow" aria-hidden="true">
                  ←
                </span>
              )}
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
      {nav && <TabBar edge="bottom" hidden={navHidden} />}
    </div>
  );
}
