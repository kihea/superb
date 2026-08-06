// Nothing at this address. Says so plainly and offers the shelf.
import { Room } from "../shell/Shell";
import { Link } from "../router/router";

export function NotFound() {
  return (
    <Room width="narrow">
      <h1 className="mark">There is nothing here.</h1>
      <Link to="/" className="btn btn--quiet self-start">
        Back to the shelf
      </Link>
    </Room>
  );
}
