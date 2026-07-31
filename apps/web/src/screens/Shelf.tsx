// Screen 3, from frame 1h: laid paper, no furniture, covers as objects with
// weight and the current one large. Finished books frost over rather than
// fade -- his own note under the frame.
import { Screen } from "../shell/Screen";
import { Link } from "../router/router";
import { useNavigate } from "../router/context";
import { bookById, shelf } from "../v0mock";
import { Cover } from "../components/Cover";
import "./Shelf.css";

export function Shelf() {
  const navigate = useNavigate();
  const current = bookById(shelf.current.id);

  return (
    <Screen title="Shelf" trail={<Link to="/settings" className="sb-quiet">···</Link>} sunken tabs>
      {current && (
        <div className="shelf-current">
          <Cover book={current} size="lg" onClick={() => navigate(`/book/${current.id}`)} />
          <div className="shelf-current__side">
            <div className="shelf-current__where">
              <span className="shelf-current__part">{shelf.current.part}</span>
              <span className="sb-caption">{shelf.current.note}</span>
            </div>
            <button type="button" className="sb-button sb-button--sm" onClick={() => navigate("/")}>
              Keep reading
            </button>
          </div>
        </div>
      )}

      <div className="shelf-grid">
        {shelf.waiting.map((id) => {
          const book = bookById(id);
          return book ? <Cover key={id} book={book} onClick={() => navigate(`/book/${id}`)} /> : null;
        })}
      </div>

      <div className="shelf-section">
        <span className="sb-eyebrow">Read</span>
        <div className="shelf-grid shelf-grid--read">
          {shelf.read.map((id) => {
            const book = bookById(id);
            return book ? (
              <Cover key={id} book={book} finished onClick={() => navigate(`/book/${id}`)} />
            ) : null;
          })}
        </div>
      </div>

      <Link to="/library" className="sb-quiet sb-quiet--centred">
        Find another
      </Link>
    </Screen>
  );
}
