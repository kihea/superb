// One shell, eleven screens. The Shelf is home; reading a book gets the
// whole page; the three games live behind /play.
import { Router } from "./router/router";
import { matchRoute, usePath } from "./router/context";
import { useTheme } from "./theme/theme";
import { useMotion } from "./theme/motion";
import { FirstOpen } from "./screens/FirstOpen";
import { Prose } from "./screens/Prose";
import { Shelf } from "./screens/Shelf";
import { Library } from "./screens/Library";
import { BookCover } from "./screens/BookCover";
import { WholeBook } from "./screens/WholeBook";
import { Play } from "./screens/Play";
import { Rhyme } from "./screens/Rhyme";
import { Association } from "./screens/Association";
import { Words } from "./screens/Words";
import { Settings } from "./screens/Settings";
import { NotFound } from "./screens/NotFound";

function Screens() {
  const path = usePath();

  const book = matchRoute("/book/:id", path);
  if (book) return <BookCover id={book.id} />;

  const reading = matchRoute("/book/:id/read", path);
  if (reading) return <WholeBook id={reading.id} />;

  switch (path) {
    case "/":
      return <Shelf />;
    case "/welcome":
      return <FirstOpen />;
    case "/library":
      return <Library />;
    case "/play":
      return <Play />;
    case "/play/prose":
      return <Prose />;
    case "/play/rhyme":
      return <Rhyme />;
    case "/play/association":
      return <Association />;
    case "/words":
      return <Words />;
    case "/settings":
      return <Settings />;
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
