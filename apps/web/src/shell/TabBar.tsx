// The row along the bottom of the Shelf (1h): the other rooms, and a quiet
// way into Settings. Plain words, no icons, no counts.
//
// Truthful-alpha checkpoint (PLAN.md §7): Rhyme, Association and Elevated
// are all v0mock-backed (a few hand-written rounds/fields/tiers, not the
// engine's real band words or a licensed rhyme/association artifact), so
// they came out of this row rather than sitting in production navigation
// pointing at invented content. The screens and their routes still exist
// (App.tsx) -- reachable by address, same as any other in-progress work --
// they are just not linked to from anywhere a reader would find them. They
// return here once Phase 3 makes them real.
import { Link } from "../router/router";
import { usePath } from "../router/context";

const ROOMS = [{ to: "/library", label: "Library" }];

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
