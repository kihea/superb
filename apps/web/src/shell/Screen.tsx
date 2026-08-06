// The frame a game sits in, inside the shell.
//
// It used to draw the rooms row at the top *and* the bottom of every screen,
// which is two of the same thing arguing about which one is the navigation.
// The shell owns that now — the rail on a wide screen, the bar on a narrow
// one — so this is only what a game round needs around it: a way back, the
// name of the practice, and room for one thing opposite.
import type { ReactNode } from "react";
import "./surface.css";
import { Link } from "../router/router";

export interface ScreenProps {
  /** The practice's name, set small and quiet at the right. */
  title?: string;
  /** Where the left-hand word goes, and what it says. */
  back?: { to: string; label: string; icon?: boolean };
  /** Anything that sits opposite the back link — an orb, a count. */
  trail?: ReactNode;
  /** Screens that lay out their own body edge to edge (a challenge board
   *  with a fixed answer row) opt out of the padded column. */
  bare?: boolean;
  children: ReactNode;
}

export function Screen({ title, back, trail, bare, children }: ScreenProps) {
  const hasTopBar = Boolean(title || back || trail);
  return (
    <div className="sb-screen">
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
            <span />
          )}
          {title ? <h1 className="sb-topbar__title">{title}</h1> : <span style={{ flex: 1 }} />}
          {trail && <span className="sb-topbar__trail">{trail}</span>}
        </header>
      )}
      {bare ? children : <div className="sb-body">{children}</div>}
    </div>
  );
}
