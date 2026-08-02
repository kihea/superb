// Nothing at this address. Says so plainly and offers the shelf.
import { Screen } from "../shell/Screen";
import { Link } from "../router/router";

export function NotFound() {
  return (
    <Screen>
      <div className="sb-body--centred">
        <h2 className="sb-heading">There's nothing here.</h2>
        <Link to="/" className="sb-quiet">
          Back to the shelf
        </Link>
      </div>
    </Screen>
  );
}
