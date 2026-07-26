"""Gloss table — writes data/out/glosses.json.

Source: the English-language extract of Wiktionary produced by `wiktextract`
(Tatu Ylonen, code MIT) and published at kaikki.org. The extraction code is
MIT; the extracted text is Wiktionary's own content, CC BY-SA 4.0 (or GFDL,
contributor's choice) — see data/NOTICE.md for the full attribution this
build-time use is required to carry, and honour it wherever a gloss reaches
a reader (Settings -> About, per ADR-008).

This script extracts *raw* dictionary glosses only. Rewriting a gloss into
the project's plain-language register, and the thorny-case panel review
ADR-012 requires before anything ships, are downstream of this file and are
not attempted here — this is a data pipeline, not the review pipeline.

Deterministic within a pinned snapshot: the source URL is a live document
that Kaikki regenerates periodically, so byte-identical output is only
guaranteed run-to-run against the same upstream snapshot. `retrieved.txt`
records the date this was last run against; re-running after an upstream
update is expected to change bytes, which is why frequency.py and
pseudowords.py (whose inputs are pinned package versions) do not share this
caveat.

Deliberately conservative about network cost: this streams the ~3 GB
upstream file once, filtering as it goes, rather than holding it on disk.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "out"
SOURCE_URL = "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl"
CONTENT_POS = {"noun", "verb", "adj", "adv"}
# Glosses that only point somewhere else teach nothing on their own.
SKIP_TAGS = {"alt-of", "abbreviation", "form-of"}


def target_words(limit: int = 30_000) -> set[str]:
    """The words this build cares about: the same band frequency.py writes."""
    freq_path = OUT_DIR / "frequency.json"
    if not freq_path.exists():
        raise SystemExit("run data/pipeline/frequency.py first (glosses.py reads its output)")
    table = json.loads(freq_path.read_text(encoding="utf-8"))
    return {row["word"] for row in table[:limit]}


def best_gloss(existing: str | None, candidate_tags: list[str], candidate_glosses: list[str]) -> str | None:
    if not candidate_glosses:
        return None
    if any(tag in SKIP_TAGS for tag in candidate_tags):
        return existing
    gloss = candidate_glosses[0].strip()
    if not gloss:
        return existing
    # First substantive gloss wins; deterministic because line order in the
    # upstream file is stable within one snapshot.
    return existing if existing is not None else gloss


def build(words: set[str], source) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw_line in source:
        if len(result) >= len(words):
            break
        line = raw_line.decode("utf-8", errors="ignore") if isinstance(raw_line, bytes) else raw_line
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if entry.get("lang_code") != "en":
            continue
        word = entry.get("word", "")
        if word not in words or word in result:
            continue
        if entry.get("pos") not in CONTENT_POS:
            continue
        for sense in entry.get("senses", []):
            gloss = best_gloss(result.get(word), sense.get("tags", []), sense.get("glosses", []))
            if gloss is not None:
                result[word] = gloss
                break
    return result


def write(glosses: dict[str, str]) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "glosses.json"
    ordered = dict(sorted(glosses.items()))
    out_path.write_text(
        json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return out_path


if __name__ == "__main__":
    words = target_words()
    print(f"streaming {SOURCE_URL} for {len(words)} target words...", file=sys.stderr)
    with urllib.request.urlopen(SOURCE_URL) as response:
        glosses = build(words, response)
    path = write(glosses)
    print(f"wrote {path} ({len(glosses)} of {len(words)} target words found)")
