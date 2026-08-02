// The first open: the mark, one question, a book in your hands. Three
// taps, no account, no permissions, about twenty seconds. The Shelf is not
// mentioned, because there is nothing on it yet.
import { useEffect, useState } from "react";
import { Screen } from "../shell/Screen";
import { Link } from "../router/router";
import { useNavigate } from "../router/context";
import { getIndexRow, type CatalogueIndexRow } from "../content/catalogue";
import "./FirstOpen.css";

export const WELCOMED_KEY = "superb.welcomed";

// Three doors, each backed by three books that earn their place on a
// first night: familiar enough to trust, good enough to keep going.
const MOODS: { label: string; ids: string[] }[] = [
  {
    label: "A story",
    ids: [
      "robert-louis-stevenson_treasure-island",
      "jane-austen_pride-and-prejudice",
      "oscar-wilde_the-picture-of-dorian-gray",
    ],
  },
  {
    label: "Something true",
    ids: [
      "frederick-douglass_narrative-of-the-life-of-frederick-douglass",
      "henry-david-thoreau_walden",
      "marcus-aurelius_meditations_george-long",
    ],
  },
  {
    label: "Poems",
    ids: [
      "walt-whitman_leaves-of-grass",
      "john-keats_poetry",
      "omar-khayyam_the-rubaiyat-of-omar-khayyam_edward-fitzgerald",
    ],
  },
];

export function FirstOpen() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"mark" | "ask" | "offer">("mark");
  const [offers, setOffers] = useState<CatalogueIndexRow[]>([]);

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

  if (step === "mark") {
    return (
      <Screen>
        <div className="sb-body--centred first-open__mark">
          <span className="first-open__wordmark">Superb</span>
          <p className="sb-said sb-rise">Nobody ever learned a word from a list.</p>
          <button type="button" className="sb-button" onClick={() => setStep("ask")}>
            Start
          </button>
        </div>
      </Screen>
    );
  }

  if (step === "ask") {
    return (
      <Screen>
        <div className="sb-body--centred first-open__ask">
          <h2 className="sb-heading">What are you in the mood for?</h2>
          <div className="first-open__choices">
            {MOODS.map((choice) => (
              <button
                key={choice.label}
                type="button"
                className="first-open__choice"
                onClick={() => void choose(choice.ids)}
              >
                {choice.label}
              </button>
            ))}
          </div>
          <Link to="/library" className="sb-quiet sb-quiet--centred">
            or browse everything
          </Link>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="sb-body--centred first-open__offer">
        <h2 className="sb-heading">Any of these three.</h2>
        <div className="first-open__books">
          {offers.map((row, i) => (
            <button
              key={row.id}
              type="button"
              className="first-open__book sb-rise"
              style={{ animationDelay: `${i * 70}ms` }}
              onClick={() => navigate(`/book/${row.id}`)}
            >
              <span className="first-open__book-title">{row.title}</span>
              <span className="sb-caption">{row.author}</span>
              {row.firstLine && <span className="first-open__book-line">“{row.firstLine}”</span>}
            </button>
          ))}
        </div>
        <Link to="/library" className="sb-quiet sb-quiet--centred">
          none of these — the whole library
        </Link>
      </div>
    </Screen>
  );
}
