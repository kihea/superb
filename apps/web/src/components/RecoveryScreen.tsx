// The one calm retry/reset screen the Slice 1A card asks for -- IndexedDB
// open/load/save failures, malformed saved state, content fetch/JSON
// failures, and unresolved effects all land here instead of an unhandled
// rejection or a permanent loader. No jargon about *why* (a reader does not
// need to know which promise rejected); "try again" is always offered,
// "start over" only where a caller names a real reset action, because for a
// content fetch failure retrying the same request is honest but wiping
// local state would not fix anything and would discard it for nothing.
import { Room } from "../shell/Shell";
import { Link } from "../router/router";

export interface RecoveryScreenProps {
  message?: string;
  onRetry: () => void;
  onReset?: () => void;
  back?: { to: string; label: string };
}

export function RecoveryScreen({
  message = "Something failed. You have lost nothing.",
  onRetry,
  onReset,
  back,
}: RecoveryScreenProps) {
  return (
    <Room width="narrow">
      {back && (
        <Link to={back.to} className="btn btn--bare self-start">
          ← {back.label.toLowerCase()}
        </Link>
      )}
      <h1 className="mark">{message}</h1>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
        {onReset && (
          <button type="button" className="btn btn--quiet" onClick={onReset}>
            Start this book again
          </button>
        )}
      </div>
    </Room>
  );
}
