// Screen 11, from frame 1s: three taps, no account, no permissions, and it
// ends on a passage. The mark, one question, reading -- about twenty
// seconds. The Shelf is not mentioned, because there is nothing on it yet.
import { useState } from "react";
import { Screen } from "../shell/Screen";
import { useNavigate } from "../router/context";
import "./FirstOpen.css";

const MOODS = [
  { label: "Something true", mood: "true" },
  { label: "Something strange", mood: "strange" },
  { label: "Something short", mood: "short" },
];

export function FirstOpen() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"mark" | "ask">("mark");

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

  return (
    <Screen>
      <div className="sb-body--centred first-open__ask">
        <h2 className="sb-heading">What are you in the mood for?</h2>
        <div className="first-open__choices">
          {MOODS.map((choice) => (
            <button
              key={choice.mood}
              type="button"
              className="first-open__choice"
              onClick={() => navigate("/")}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <span className="sb-caption">One question, and only because it picks the first passage.</span>
      </div>
    </Screen>
  );
}
