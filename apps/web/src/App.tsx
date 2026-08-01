// Fourteen screens, one shell. `/` is still the reading state and still the
// engine-wired one -- the rest of v0 grew around it rather than in front of
// it, so the app opens on a passage exactly as it did before.
//
// Truthful-alpha checkpoint (PLAN.md §7, hermes review on PR #118): every
// screen still backed by `v0mock` (routes.ts's own `productionNav: false`)
// is imported with `lazy()` here rather than a plain static import. A
// static import puts the module -- and everything it pulls in, `v0mock`
// included -- in this file's own dependency graph, which a production
// bundler resolves eagerly regardless of whether the route is ever visited.
// `lazy()` makes each of these its own chunk, fetched only if a reader
// actually navigates there directly; nobody in the real reachable graph
// does (the production-navigation inventory test in walkable-v0.spec.ts
// proves that). This is not the same claim as "unreachable" -- routes.ts's
// own comment already covers why these routes still resolve by address,
// same as any other in-progress work.
import { lazy, Suspense } from "react";
import { Router } from "./router/router";
import { matchRoute, usePath } from "./router/context";
import { useTheme } from "./theme/theme";
import { useMotion } from "./theme/motion";
import { ReadingScreen } from "./components/ReadingScreen";
import { Library } from "./screens/Library";
import { BookCover } from "./screens/BookCover";
import { WholeBook } from "./screens/WholeBook";
import { Settings } from "./screens/Settings";
import { NotFound } from "./screens/NotFound";

const FirstOpen = lazy(() => import("./screens/FirstOpen").then((m) => ({ default: m.FirstOpen })));
const Shelf = lazy(() => import("./screens/Shelf").then((m) => ({ default: m.Shelf })));
const Voice = lazy(() => import("./screens/Voice").then((m) => ({ default: m.Voice })));
const Rhyme = lazy(() => import("./screens/Rhyme").then((m) => ({ default: m.Rhyme })));
const Association = lazy(() => import("./screens/Association").then((m) => ({ default: m.Association })));
const Elevated = lazy(() => import("./screens/Elevated").then((m) => ({ default: m.Elevated })));
const SignIn = lazy(() => import("./screens/SignIn").then((m) => ({ default: m.SignIn })));
const Share = lazy(() => import("./screens/Share").then((m) => ({ default: m.Share })));

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
      return (
        <Suspense fallback={null}>
          <FirstOpen />
        </Suspense>
      );
    case "/shelf":
      return (
        <Suspense fallback={null}>
          <Shelf />
        </Suspense>
      );
    case "/library":
      return <Library />;
    case "/voice":
      return (
        <Suspense fallback={null}>
          <Voice />
        </Suspense>
      );
    case "/rhyme":
      return (
        <Suspense fallback={null}>
          <Rhyme />
        </Suspense>
      );
    case "/association":
      return (
        <Suspense fallback={null}>
          <Association />
        </Suspense>
      );
    case "/elevated":
      return (
        <Suspense fallback={null}>
          <Elevated />
        </Suspense>
      );
    case "/sign-in":
      return (
        <Suspense fallback={null}>
          <SignIn />
        </Suspense>
      );
    case "/settings":
      return <Settings />;
    case "/share":
      return (
        <Suspense fallback={null}>
          <Share />
        </Suspense>
      );
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
