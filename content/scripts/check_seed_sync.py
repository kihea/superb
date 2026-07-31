"""content/sources/_seed.py stays in sync with the files it authored
(issue #67, filed from PR #65's review of issue #58).

Issue #58: `_seed.py`'s table was the authoring source of truth for the 54
hand-picked excerpts under `content/sources/src-*.json`, but two bulk fixes
(a `signals` array added crate-wide, a citation URL repaired corpus-wide)
were applied straight to the committed JSON and never folded back into the
table — so the next run of `_seed.py` would have silently reverted both.
PR #65 fixed that drift once. Nothing stopped it recurring the same way at
the next bulk change, which is what this script closes: `_seed.py` is run
for real, in a scratch copy of itself so the working tree's own committed
files are never touched, and its output is compared to the committed files
it claims to author.

**Only the 54 files `_seed.py` itself writes are in scope.** `content/sources/`
holds thousands more (`data/pipeline/excerpts.py`'s much larger corpus) that
`_seed.py` has never touched and this script does not read — comparing the
whole directory would flag files nothing here claims to own.

**Why a scratch copy of the script, not the script run in place.** `_seed.py`
computes its own output directory from `pathlib.Path(__file__).parent` — it
has no `--out-dir` flag, and giving it one would be a change to a
hand-authored content file for a CI script's convenience. Copying the file
itself into an empty temporary directory and running the copy there makes
`__file__` resolve to that directory, so the real `content/sources/*.json`
files are never opened for writing at all — nothing to restore afterward
because nothing was touched.

**Content, not raw bytes.** `_seed.py`'s own `Path.write_text` has no
`newline=` argument, so on a Windows checkout of the script itself (not
just of its output) that write happens through Python's default text-mode
translation and lands as CRLF; the committed files are LF. A byte-for-byte
diff would flap red for exactly that reason on every Windows contributor's
machine, independent of anything the script actually generated differently.
`pathlib.Path.read_text()` performs universal-newline translation on *input*
regardless of platform or what was written, so reading both sides through it
— never `read_bytes()` — makes the comparison line-ending-agnostic by
construction rather than by a normalization step that could itself be wrong.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED_SCRIPT = ROOT / "sources" / "_seed.py"
SOURCES_DIR = ROOT / "sources"


def run_seed_in_scratch(scratch: Path) -> list[Path]:
    """Copy `_seed.py` into `scratch` and run the copy there, so it writes
    its output files into `scratch` rather than into `content/sources/`.
    Returns every `*.json` file it wrote."""
    scratch_seed = scratch / "_seed.py"
    shutil.copyfile(SEED_SCRIPT, scratch_seed)

    result = subprocess.run(
        [sys.executable, str(scratch_seed)],
        cwd=scratch,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"content/sources/_seed.py failed when run in a scratch copy "
            f"(exit {result.returncode}):\n{result.stdout}\n{result.stderr}"
        )

    return sorted(scratch.glob("*.json"))


def failures() -> list[str]:
    # Read every fresh file's text while the scratch directory still exists
    # — `TemporaryDirectory` deletes it the moment the `with` block exits,
    # and a `Path` captured from inside does not outlive that.
    with tempfile.TemporaryDirectory() as tmp:
        scratch = Path(tmp)
        fresh_files = run_seed_in_scratch(scratch)
        fresh_text_by_name = {
            path.name: path.read_text(encoding="utf-8") for path in fresh_files
        }

    if not fresh_text_by_name:
        return [
            "content/sources/_seed.py wrote no .json files when run — its "
            "SOURCES table is empty or its write step is broken"
        ]

    errors: list[str] = []
    for name, fresh_text in fresh_text_by_name.items():
        committed_path = SOURCES_DIR / name

        if not committed_path.exists():
            errors.append(
                f"{committed_path} does not exist, but content/sources/_seed.py "
                f"writes it — run the script for real and commit its output."
            )
            continue

        committed_text = committed_path.read_text(encoding="utf-8")
        if committed_text != fresh_text:
            errors.append(
                f"{committed_path} does not match a fresh run of "
                f"content/sources/_seed.py — the table and the committed file "
                f"have drifted (this is exactly how issue #58 happened). Either "
                f"the table needs updating from a change already applied to "
                f"the committed file, or the script needs re-running and its "
                f"output committing; do not silently overwrite one without "
                f"checking which one moved."
            )

    return errors


def main() -> int:
    errors = failures()
    for error in errors:
        print(f"FAIL: {error}", file=sys.stderr)
    if errors:
        return 1
    print("ok: content/sources/_seed.py matches every committed file it authors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
