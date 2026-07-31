// Fourteen screens, one shell. `/` is still the reading state and still the
// engine-wired one -- the rest of v0 grew around it rather than in front of
// it, so the app opens on a passage exactly as it did before.
import { Router } from "./router/router";
import { matchRoute, usePath } from "./router/context";
import { useTheme } from "./theme/theme";
import { useMotion } from "./theme/motion";
import { ReadingScreen } from "./components/ReadingScreen";
import { FirstOpen } from "./screens/FirstOpen";
import { Shelf } from "./screens/Shelf";
import { Library } from "./screens/Library";
import { BookCover } from "./screens/BookCover";
import { WholeBook } from "./screens/WholeBook";
import { Voice } from "./screens/Voice";
import { Rhyme } from "./screens/Rhyme";
import { Association } from "./screens/Association";
import { Elevated } from "./screens/Elevated";
import { SignIn } from "./screens/SignIn";
import { Settings } from "./screens/Settings";
import { Share } from "./screens/Share";
import { NotFound } from "./screens/NotFound";

function Screens() {
  const path = usePath();

  const book = matchRoute("/book/:id", path);
  if (book) return <BookCover id={book.id} />;

  const reading = matchRoute("/book/:id/read", path);
  if (reading) return <WholeBook id={reading.id} />;

  switch (path) {
    case "/":
      return <ReadingScreen />;
    case "/welcome":
      return <FirstOpen />;
    case "/shelf":
      return <Shelf />;
    case "/library":
      return <Library />;
    case "/voice":
      return <Voice />;
    case "/rhyme":
      return <Rhyme />;
    case "/association":
      return <Association />;
    case "/elevated":
      return <Elevated />;
    case "/sign-in":
      return <SignIn />;
    case "/settings":
      return <Settings />;
    case "/share":
      return <Share />;
    default:
      return <NotFound />;
  }
}

export default function App() {
  // Held at the root so the choice survives moving between screens, and so
  // it is restored before anything downstream (VoiceOrb's own canvas loop)
  // paints its first frame -- Settings reaches the same hooks and writes to
  // the same keys.
  useTheme();
  useMotion();
  return (
    <Router>
      <Screens />
    </Router>
  );
}
