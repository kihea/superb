import { useEffect } from "react";
import { ReadingScreen } from "./components/ReadingScreen";
import { isRegister } from "./design/register";

function Picker() {
  useEffect(() => {
    document.documentElement.removeAttribute("data-register");
  }, []);
  return (
    <main className="picker">
      <p className="picker-lede">Two ways to read. Open one, or both.</p>
      <a className="picker-link" href="/read?register=glass">
        Glass — the page stays dark and atmospheric behind the words.
      </a>
      <a className="picker-link" href="/read?register=paper">
        Paper — the chrome disappears; only the page is left.
      </a>
    </main>
  );
}

export default function App() {
  const url = new URL(window.location.href);
  const onReadRoute = url.pathname === "/read";
  const requested = url.searchParams.get("register");
  const register = isRegister(requested) ? requested : "glass";

  useEffect(() => {
    if (onReadRoute) {
      document.documentElement.dataset.register = register;
    }
  }, [onReadRoute, register]);

  if (!onReadRoute) return <Picker />;
  return <ReadingScreen register={register} />;
}
