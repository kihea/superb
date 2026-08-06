// The first open: the mark, one question, a book in your hands. Three taps,
// no account, no permissions, about twenty seconds. The Shelf is not
// mentioned, because there is nothing on it yet.
//
// The old first screen was a wordmark, a line and a red button on cream —
// correct, and completely unmemorable, which the audit called out as the
// worst place in the app to carry no identity at all. It opens on the plate
// now: the same generated ASCII mark every book on the shelf will wear, with
// SUPERB carved out of it.
import { useEffect, useState } from "react";
import { Link } from "../router/router";
import { useNavigate } from "../router/context";
import { getIndexRow, type CatalogueIndexRow } from "../content/catalogue";
import { Plate } from "../components/Plate";
import { useLive } from "../components/useLive";
import { genreOf } from "../content/genre";
import "./FirstOpen.css";

export const WELCOMED_KEY = "superb.welcomed";

// Three doors, each backed by three books that earn their place on a first
// night: familiar enough to trust, good enough to keep going.
const MOODS: { label: string; kind: string; ids: string[] }[] = [
  {
    label: "A story",
    kind: "Fiction",
    ids: [
      "robert-louis-stevenson_treasure-island",
      "jane-austen_pride-and-prejudice",
      "oscar-wilde_the-picture-of-dorian-gray",
    ],
  },
  {
    label: "Something true",
    kind: "Nonfiction",
    ids: [
      "frederick-douglass_narrative-of-the-life-of-frederick-douglass",
      "henry-david-thoreau_walden",
      "marcus-aurelius_meditations_george-long",
    ],
  },
  {
    label: "Poems",
    kind: "Poetry",
    ids: [
      "walt-whitman_leaves-of-grass",
      "john-keats_poetry",
      "omar-khayyam_the-rubaiyat-of-omar-khayyam_edward-fitzgerald",
    ],
  },
];

function Mood({ mood, onPick }: { mood: (typeof MOODS)[number]; onPick: () => void }) {
  const { live, liveProps } = useLive();
  return (
    <button type="button" className="first__mood" onClick={onPick} {...liveProps}>
      <Plate seed={mood.label} kind={mood.kind} cols={20} rows={5} size={8} live={live} />
      <span className="first__mood-label">{mood.label}</span>
    </button>
  );
}

function Offer({ row, onPick }: { row: CatalogueIndexRow; onPick: () => void }) {
  const { live, liveProps } = useLive();
  return (
    <button type="button" className="first__book" onClick={onPick} {...liveProps}>
      <Plate seed={row.title} kind={genreOf(row)} cols={32} rows={9} size={7.5} live={live} />
      <span className="first__book-title">{row.title}</span>
      <span className="meta">{row.author}</span>
      {row.firstLine && <span className="first__book-line">“{row.firstLine}”</span>}
    </button>
  );
}

export function FirstOpen() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"mark" | "ask" | "offer">("mark");
  const [offers, setOffers] = useState<CatalogueIndexRow[]>([]);
  const { live, liveProps } = useLive();

  useEffect(() => {
    try {
      window.localStorage.setItem(WELCOMED_KEY, "1");
    } catch {
      // Private browsing; the welcome will simply show again.
    }
  }, []);

  async function choose(ids: string[]) {
    const rows = await Promise.all(ids.map((id) => getIndexRow(id).catch(() => undefined)));
    const found = rows.filter((row): row is CatalogueIndexRow => Boolean(row));
    if (found.length === 0) {
      navigate("/library");
      return;
    }
    setOffers(found);
    setStep("offer");
  }

  return (
    <div className="first">
      <div className="first__stage" {...liveProps}>
        <Plate seed="SUPERB" kind="Fiction" cols={34} rows={11} size={10} live={live || step !== "mark"} />

        {step === "mark" && (
          <div className="first__panel enter">
            <p className="first__line">
              Nobody learns a word from a list. Read a book instead, and keep every word you do not
              know.
            </p>
            <button type="button" className="btn" onClick={() => setStep("ask")}>
              Start
            </button>
            <span className="meta">no account · nothing leaves this device</span>
          </div>
        )}

        {step === "ask" && (
          <div className="first__panel enter">
            <h2 className="mark first__ask">What do you want to read?</h2>
            <div className="first__moods">
              {MOODS.map((mood) => (
                <Mood key={mood.label} mood={mood} onPick={() => void choose(mood.ids)} />
              ))}
            </div>
            <Link to="/library" className="btn btn--bare">
              or see the whole library
            </Link>
          </div>
        )}

        {step === "offer" && (
          <div className="first__panel enter">
            <h2 className="mark first__ask">Start with one of these three.</h2>
            <div className="first__books">
              {offers.map((row) => (
                <Offer key={row.id} row={row} onPick={() => navigate(`/book/${row.id}`)} />
              ))}
            </div>
            <Link to="/library" className="btn btn--bare">
              none of these, show the library
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
