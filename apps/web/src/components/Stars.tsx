// Stars, for rating a book and for showing one.
//
// Five of them, and no colour: a filled star is filled and an empty one is
// outlined, so the rating survives being read by someone who cannot tell the
// accent from the ground. The interactive version is a real radio group, so
// it can be set from the keyboard and read out loud correctly.
import "./Stars.css";

const STAR = "★";
const EMPTY = "☆";

export function Stars({ value, of = 5 }: { value: number; of?: number }) {
  const whole = Math.round(value);
  return (
    <span className="stars" role="img" aria-label={`${value.toFixed(1)} out of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < whole ? "stars__on" : "stars__off"} aria-hidden="true">
          {i < whole ? STAR : EMPTY}
        </span>
      ))}
    </span>
  );
}

export function StarPicker({
  value,
  onChange,
  label = "Your rating",
}: {
  value?: number;
  onChange: (stars: number | undefined) => void;
  label?: string;
}) {
  return (
    <fieldset className="stars-pick">
      <legend className="sr-only">{label}</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={`stars-pick__star${value && n <= value ? " stars-pick__star--on" : ""}`}>
          <input
            type="radio"
            name={`stars-${label}`}
            checked={value === n}
            onChange={() => onChange(n)}
            className="sr-only"
          />
          <span aria-hidden="true">{value && n <= value ? STAR : EMPTY}</span>
          <span className="sr-only">{n === 1 ? "1 star" : `${n} stars`}</span>
        </label>
      ))}
      {value !== undefined && (
        <button type="button" className="btn btn--bare stars-pick__clear" onClick={() => onChange(undefined)}>
          clear
        </button>
      )}
    </fieldset>
  );
}
