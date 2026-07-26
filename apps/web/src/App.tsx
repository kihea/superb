// ADVISORY-008 §1: the register is decided (ADR-019, Kihea 2026-07-25) and
// the picker was re-deriving a settled question in the diff. The app opens
// straight into the reading state -- there is no other screen yet, and no
// switch.
import { ReadingScreen } from "./components/ReadingScreen";

export default function App() {
  return <ReadingScreen />;
}
