// The row along the bottom of the Shelf (1h): the four other rooms, and a
// quiet way into Settings. Plain words, no icons, no counts.
import { Link } from "../router/router";
import { usePath } from "../router/context";

const ROOMS = [
  { to: "/library", label: "Library" },
  { to: "/rhyme", label: "Rhyme" },
  { to: "/association", label: "Assoc." },
  { to: "/elevated", label: "Elevated" },
];

export function TabBar() {
  const path = usePath();
  return (
    <nav className="sb-tabbar" aria-label="Rooms">
      {ROOMS.map((room) => (
        <Link
          key={room.to}
          to={room.to}
          className={`sb-tabbar__link${path.startsWith(room.to) ? " sb-tabbar__link--on" : ""}`}
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
