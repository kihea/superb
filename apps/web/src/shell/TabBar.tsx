// The row along the bottom of the four rooms: Shelf, Library, Play, Words,
// and a quiet way into Settings. Plain words, no icons, no counts.
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

export function TabBar() {
  const path = usePath();
  return (
    <nav className="sb-tabbar" aria-label="Rooms">
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
      <Link to="/settings" className="sb-tabbar__link" aria-label="Settings">
        ···
      </Link>
    </nav>
  );
}
