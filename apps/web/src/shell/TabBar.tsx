// The row of rooms: Shelf, Library, Play, Words, and a quiet way into
// Settings. Plain words, no icons, no counts. It now stands at both edges
// of every room — top and bottom — and steps aside while the reader
// scrolls down, coming back the moment they look up.
import { Link } from "../router/router";
import { usePath } from "../router/context";

const ROOMS = [
  { to: "/", label: "Shelf" },
  { to: "/library", label: "Library" },
  { to: "/play", label: "Play" },
  { to: "/words", label: "Words" },
];

function isOn(path: string, to: string): boolean {
  if (to === "/") return path === "/";
  return path.startsWith(to);
}

export function TabBar({ edge, hidden }: { edge: "top" | "bottom"; hidden: boolean }) {
  const path = usePath();
  return (
    <nav
      className={`sb-tabbar sb-tabbar--${edge}`}
      data-hidden={hidden || undefined}
      aria-label={edge === "top" ? "Rooms" : "Rooms, again"}
    >
      {ROOMS.map((room) => (
        <Link
          key={room.to}
          to={room.to}
          className={`sb-tabbar__link${isOn(path, room.to) ? " sb-tabbar__link--on" : ""}`}
        >
          {room.label}
        </Link>
      ))}
      <span className="sb-tabbar__spacer" />
      <Link
        to="/settings"
        className={`sb-tabbar__link${isOn(path, "/settings") ? " sb-tabbar__link--on" : ""}`}
        aria-label="Settings"
      >
        ···
      </Link>
    </nav>
  );
}
