// The one calm retry/reset screen the Slice 1A card asks for -- IndexedDB
// open/load/save failures, malformed saved state, content fetch/JSON
// failures, and unresolved effects all land here instead of an unhandled
// rejection or a permanent loader. No jargon about *why* (a reader does not
// need to know which promise rejected); "try again" is always offered,
// "start over" only where a caller names a real reset action, because for a
// content fetch failure retrying the same request is honest but wiping
// local state would not fix anything and would discard it for nothing.
import { Screen } from "../shell/Screen";

export interface RecoveryScreenProps {
  message?: string;
  onRetry: () => void;
  onReset?: () => void;
  back?: { to: string; label: string };
}

export function RecoveryScreen({
  message = "Something went wrong. Nothing has been lost.",
  onRetry,
  onReset,
  back,
}: RecoveryScreenProps) {
  return (
    <Screen back={back}>
      <div className="sb-body--centred">
        <h2 className="sb-heading">{message}</h2>
        <button type="button" className="sb-button" onClick={onRetry}>
          Try again
        </button>
        {onReset && (
          <button type="button" className="sb-quiet" onClick={onReset}>
            Start this book over
          </button>
        )}
      </div>
    </Screen>
  );
}
