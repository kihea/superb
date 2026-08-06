// One shell, eleven screens. Two of them stand outside it: reading, which
// takes the whole page, and the first open, which has no rooms to show yet.
import { Router } from "./router/router";
import { matchRoute, usePath } from "./router/context";
import { usePageSettings } from "./reading/settings";
import { useMotion } from "./theme/motion";
import { Shell } from "./shell/Shell";
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

function Rooms() {
  const path = usePath();

  const book = matchRoute("/book/:id", path);
  if (book) return <BookCover id={book.id} />;

  switch (path) {
    case "/":
      return <Shelf />;
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

function Frame() {
  const path = usePath();

  const reading = matchRoute("/book/:id/read", path);
  if (reading) return <WholeBook id={reading.id} />;
  if (path === "/welcome") return <FirstOpen />;

  return (
    <Shell>
      <Rooms />
    </Shell>
  );
}

export default function App() {
  // Held at the root so the choice survives moving between screens, and so
  // it is on <html> before anything downstream (a canvas loop, the reader's
  // own paper) paints its first frame.
  usePageSettings();
  useMotion();
  return (
    <Router>
      <Frame />
    </Router>
  );
}
