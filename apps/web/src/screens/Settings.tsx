// Screen 13, from frame 1u: the one room where options may look like
// options and a number may face the reader. Everything here does something
// -- the paper swatches, the text size and the motion switch all take
// effect immediately and survive a reload.
//
// Two rows from his frame are not here. "Listening time 7 h 12 m of 10 h"
// and "Renews 12 August · £4.99 a month" describe a subscription that does
// not exist in this build; a real-looking bill is a different kind of thing
// from mocked sample data, so the voice row says what is true instead.
import { useEffect, useState } from "react";
import { Screen } from "../shell/Screen";
import { Link } from "../router/router";
import { useTheme } from "../theme/theme";
import type { Paper } from "../theme/theme";
import { books } from "../v0mock";
import "./Settings.css";

const PAPERS: { id: Paper; label: string; swatch: string }[] = [
  { id: "oxblood", label: "Oxblood", swatch: "settings-swatch--oxblood" },
  { id: "lilac", label: "Lilac", swatch: "settings-swatch--lilac" },
  { id: "glacier", label: "Glacier", swatch: "settings-swatch--glacier" },
];

const SCALE_KEY = "superb.readerScale";
const MOTION_KEY = "superb.motion";

export function Settings() {
  const { paper, night, setPaper, setNight } = useTheme();
  const [scale, setScale] = useState(() => Number(localStorage.getItem(SCALE_KEY) ?? 1) || 1);
  const [motion, setMotion] = useState(() => localStorage.getItem(MOTION_KEY) !== "off");

  useEffect(() => {
    document.documentElement.style.setProperty("--reader-scale", String(scale));
    localStorage.setItem(SCALE_KEY, String(scale));
  }, [scale]);

  useEffect(() => {
    document.documentElement.setAttribute("data-motion", motion ? "on" : "off");
    localStorage.setItem(MOTION_KEY, motion ? "on" : "off");
  }, [motion]);

  return (
    <Screen title="Settings" back={{ to: "/shelf", label: "Shelf" }}>
      <section className="settings-group">
        <span className="sb-eyebrow">Paper</span>
        <div className="settings-papers">
          {PAPERS.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={`settings-swatch ${choice.swatch}${
                paper === choice.id && night !== "on" ? " settings-swatch--on" : ""
              }`}
              onClick={() => {
                setPaper(choice.id);
                setNight("off");
              }}
            >
              {choice.label}
            </button>
          ))}
          <button
            type="button"
            className={`settings-swatch settings-swatch--night${night === "on" ? " settings-swatch--on" : ""}`}
            onClick={() => setNight(night === "on" ? "system" : "on")}
          >
            Night
          </button>
        </div>
        {night === "system" && <span className="sb-caption">Following your phone, light or dark.</span>}
      </section>

      <section className="settings-group">
        <span className="sb-eyebrow">Text size</span>
        <div className="settings-size">
          <span className="settings-size__small">Aa</span>
          <input
            type="range"
            min="0.85"
            max="1.35"
            step="0.05"
            value={scale}
            aria-label="Text size"
            onChange={(e) => setScale(Number(e.target.value))}
          />
          <span className="settings-size__large">Aa</span>
        </div>
      </section>

      <div className="settings-rows">
        <div className="settings-row">
          <span className="settings-row__names">
            <span className="settings-row__name">Motion</span>
            <span className="sb-caption">sheets rise; nothing else moves</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={motion}
            aria-label="Motion"
            className={`settings-switch${motion ? " settings-switch--on" : ""}`}
            onClick={() => setMotion((on) => !on)}
          >
            <span className="settings-switch__knob" />
          </button>
        </div>

        <Link to="/voice" className="settings-row settings-row--link">
          <span className="settings-row__names">
            <span className="settings-row__name">Voice</span>
            <span className="sb-caption">your phone's own</span>
          </span>
          <span className="sb-list__aside">Change</span>
        </Link>

        <Link to="/sign-in" className="settings-row settings-row--link">
          <span className="settings-row__name">Account</span>
          <span className="sb-list__aside">signed out</span>
        </Link>

        <div className="settings-row">
          <span className="settings-row__name">Credits and licences</span>
          <span className="sb-list__aside">{books.length} texts</span>
        </div>
      </div>

      <Link to="/welcome" className="sb-quiet sb-quiet--centred">
        See the first open again
      </Link>
    </Screen>
  );
}
