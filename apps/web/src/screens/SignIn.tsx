// Screen 12, from the turn-3 frame (3b) built out of the marketing page:
// the colour mesh, the headline in the UI face with one word in the drawn
// one, then the plain business. It says what an account adds and then gets
// out of the way -- reading, word tap, the games and the free voice all
// work signed out.
//
// The buttons are real controls with nothing behind them yet; there is no
// account system in this build.
import { Screen } from "../shell/Screen";
import { useNavigate } from "../router/context";
import "./SignIn.css";

export function SignIn() {
  const navigate = useNavigate();
  return (
    <Screen>
      <div className="signin-mesh">
        <button type="button" className="sb-quiet signin-not-now" onClick={() => navigate("/")}>
          Not now
        </button>
        <span className="sb-eyebrow signin-eyebrow">Optional, as ever</span>
        <h2 className="signin-headline">
          Your words, on <span className="signin-headline__hand">whichever</span> phone you pick up.
        </h2>
      </div>

      <div className="signin-business">
        <div className="signin-ways">
          <button type="button" className="sb-button sb-button--dark sb-button--wide">
            Continue with Apple
          </button>
          <button type="button" className="sb-button sb-button--secondary sb-button--wide">
            Continue with Google
          </button>
          <div className="signin-or">
            <span className="signin-or__rule" />
            <span className="sb-caption">or</span>
            <span className="signin-or__rule" />
          </div>
          <input className="sb-field" type="email" placeholder="you@example.com" aria-label="Your email" />
          <button type="button" className="sb-button sb-button--secondary sb-button--wide">
            Email me a link
          </button>
        </div>

        <p className="sb-caption">
          Reading, word tap, the games and the free voice all work without an account. Nothing is held
          back.
        </p>
      </div>
    </Screen>
  );
}
