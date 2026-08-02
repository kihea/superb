// Every screen in the app, in one list. A screen that is not here is a
// screen nobody can reach. The smoke test walks this list.
export interface RouteEntry {
  path: string;
  /** What the screen is, in the words a reader would use. */
  name: string;
  /** A concrete path for the smoke test, where `path` has a parameter. */
  example?: string;
}

export const ROUTES: RouteEntry[] = [
  { path: "/", name: "Shelf" },
  { path: "/welcome", name: "First open" },
  { path: "/library", name: "Finding a book" },
  {
    path: "/book/:id",
    name: "One book, before you start",
    example: "/book/bram-stoker_dracula",
  },
  {
    path: "/book/:id/read",
    name: "Inside a book",
    example: "/book/bram-stoker_dracula/read",
  },
  { path: "/play", name: "The games" },
  { path: "/play/prose", name: "Prose, tuned to you" },
  { path: "/play/rhyme", name: "Rhyme" },
  { path: "/play/association", name: "Association" },
  { path: "/words", name: "Your words" },
  { path: "/settings", name: "Settings" },
];

// The word card is not a route. It is what a tapped word opens while
// reading, and it is reached there.
