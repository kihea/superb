// Every screen in the app, in one list. This is the route map the PR body
// quotes and the smoke e2e walks -- a screen that is not here is a screen
// nobody can reach, which for v0 is the only kind of failure that counts.
//
// `screen` is Kihea's own numbering from the design canvas; `frame` is the
// iteration each route was built from.
export interface RouteEntry {
  path: string;
  /** What the screen is, in the words a reader would use. */
  name: string;
  screen: number;
  frame: string;
  /** A concrete path for the smoke test, where `path` has a parameter. */
  example?: string;
}

export const ROUTES: RouteEntry[] = [
  { path: "/", name: "Reading", screen: 1, frame: "3a (wide: 3c)" },
  { path: "/welcome", name: "First open", screen: 11, frame: "1s" },
  { path: "/shelf", name: "Shelf", screen: 3, frame: "1h" },
  { path: "/library", name: "Finding a book", screen: 4, frame: "2g" },
  { path: "/book/:id", name: "One book, before you start", screen: 5, frame: "2h", example: "/book/meditations" },
  {
    path: "/book/:id/read",
    name: "Inside a whole book",
    screen: 6,
    frame: "1e",
    example: "/book/up-from-slavery/read",
  },
  { path: "/voice", name: "The better voice", screen: 7, frame: "2c (orb itself: 2b)" },
  { path: "/rhyme", name: "Rhyme", screen: 8, frame: "2d" },
  { path: "/association", name: "Association", screen: 9, frame: "3d" },
  { path: "/elevated", name: "Elevated passages", screen: 10, frame: "1r" },
  { path: "/sign-in", name: "Sign in", screen: 12, frame: "3b" },
  { path: "/settings", name: "Settings", screen: 13, frame: "1u" },
  { path: "/share", name: "Passing a passage on", screen: 14, frame: "2k" },
];

// Screen 2 -- the gloss card -- is not a route. It is what a tapped word
// opens on the reading screen (1c), and it is reached there.
