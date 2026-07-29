"""Proves the M2 item 5b fix to glosses.py's sense selection.

The diagnosis (workspace/contract.md item 5b, ADVISORY-007 §4): `build()`
took a word's *first* substantive dictionary sense in upstream file order,
with no regard for whether that sense was the common one. "shook" is the
case that surfaced it — the real kaikki.org snapshot lists a rare dialectal
noun/verb sense ("a set of pieces for making a cask or box, usually wood")
ahead of "simple past of shake", so the pipeline glossed the frequency
band's "shook" as a cask term. `excerpts.py`'s gloss-overlap signal then
fired on excerpts whose own unrelated words ("wood", "set", ...) happened to
coincide with that wrong gloss's vocabulary — a false claim that a passage
teaches a word it never used in that sense, precisely the corrupting
direction docs/seams.md §Seam 2 warns about.

The fixtures below are trimmed, schema-accurate copies of the real kaikki.org
lines for "shook" (fetched and inspected by hand while diagnosing this, not
invented) — same `tags` / `form_of` shape, prose shortened. This is the
regression the fix exists to hold: given these exact lines, in this exact
order, `build()` must gloss "shook" as "shake"'s sense, not the cask one.

Run: python data/pipeline/tests/test_glosses.py
"""

from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import glosses as gl  # noqa: E402

# Trimmed, schema-accurate copies of the real kaikki.org lines for "shook",
# in the order they appear in the 2026-07-25 snapshot: a rare dialectal noun
# sense, a rare verb sense sharing its etymology, the ordinary "simple past
# of shake" form-of sense, and a modern slang adjective sense — four
# homographs, only one of which is what the frequency-drawn word actually
# means in 19th-century prose.
SHOOK_NOUN_RARE = {
    "pos": "noun", "word": "shook", "lang_code": "en",
    "senses": [{"glosses": ["A set of pieces for making a cask or box, usually wood."]}],
}
SHOOK_VERB_RARE = {
    "pos": "verb", "word": "shook", "lang_code": "en",
    "senses": [{"glosses": ["To pack (staves, etc.) in a shook."]}],
}
SHOOK_FORM_OF_SHAKE = {
    "pos": "verb", "word": "shook", "lang_code": "en",
    "senses": [
        {"glosses": ["simple past of shake."], "tags": ["form-of", "past"], "form_of": [{"word": "shake"}]},
        {"glosses": ["past participle of shake"], "tags": ["form-of", "participle", "past"], "form_of": [{"word": "shake"}]},
    ],
}
SHOOK_ADJ_SLANG = {
    "pos": "adj", "word": "shook", "lang_code": "en",
    "senses": [{"glosses": ["Shaken up; rattled; shocked or surprised."], "tags": ["slang"]}],
}
SHAKE_LEMMA = {
    "pos": "verb", "word": "shake", "lang_code": "en",
    "senses": [{"glosses": ["To move quickly back and forth or up and down with short, jerky movements."]}],
}

# The *exact* real kaikki.org entries for "shook" (2026-07-26 snapshot,
# fetched via https://kaikki.org/dictionary/English/meaning/s/sh/shook.jsonl),
# reproduced verbatim rather than trimmed. This is the fixture that caught a
# second bug the trimmed fixtures above did not: the noun entry above has
# one sense; the real noun entry has *two* ("cask" and "furniture parts"),
# and the real "to pack ... in a shook" verb sense sits in its own entry,
# separate from the form-of-shake verb entry. Feeding the real shape through
# an earlier version of this fix (entry-wide redirect scan missing) still
# glossed "shook" as the cask noun in a full pipeline run, even though every
# check above passed — the trimmed fixtures happened not to exercise the
# exact multi-sense/multi-entry interaction. This fixture is the one that
# does.
SHOOK_REAL_NOUN = {
    "pos": "noun", "word": "shook", "lang_code": "en",
    "senses": [
        {"glosses": ["A set of pieces for making a cask or box, usually wood."]},
        {"glosses": ["The parts of a piece of house furniture, as a bedstead, packed together."]},
    ],
}
SHOOK_REAL_VERB_PACK = {
    "pos": "verb", "word": "shook", "lang_code": "en",
    "senses": [{"glosses": ["To pack (staves, etc.) in a shook."]}],
}
SHOOK_REAL_VERB_FORM_OF = {
    "pos": "verb", "word": "shook", "lang_code": "en",
    "senses": [
        {"glosses": ["simple past of shake."], "tags": ["form-of", "past"], "form_of": [{"word": "shake"}]},
        {"glosses": ["past participle of shake"], "tags": ["form-of", "informal", "participle", "past"], "form_of": [{"word": "shake"}]},
    ],
}
SHOOK_REAL_ADJ = {
    "pos": "adj", "word": "shook", "lang_code": "en",
    "senses": [
        {"glosses": ["Shaken up; rattled; shocked or surprised."], "tags": ["slang"]},
        {"glosses": ["Emotionally upset or disturbed; scared."], "tags": ["slang"]},
    ],
}
SHAKE_REAL_LEMMA = {
    "pos": "verb", "word": "shake", "lang_code": "en",
    "senses": [{"glosses": ["To cause (something) to move rapidly in opposite directions alternatingly."]}],
}


def lines(*entries: dict) -> list[str]:
    return [json.dumps(e) for e in entries]


def check(label: str, condition: bool, detail: str, problems: list[str]) -> None:
    if not condition:
        problems.append(f"{label}: {detail}")


def main() -> int:
    problems: list[str] = []

    # 1. The regression this fix exists for: "shook" resolves to "shake"'s
    # sense, not the cask noun's, even though the cask entries come first.
    result = gl.build(
        {"shook", "shake"},
        lines(SHOOK_NOUN_RARE, SHOOK_VERB_RARE, SHOOK_FORM_OF_SHAKE, SHOOK_ADJ_SLANG, SHAKE_LEMMA),
    )
    check(
        "shook resolves via its form-of redirect",
        result.get("shook") == result.get("shake") == SHAKE_LEMMA["senses"][0]["glosses"][0],
        f"got shook={result.get('shook')!r}, shake={result.get('shake')!r}",
        problems,
    )

    # 2. Order independence: the lemma entry arriving *before* the inflected
    # form's entries must not change the answer (build() resolves redirects
    # in a pass over the whole file, not by racing entry order).
    result_reordered = gl.build(
        {"shook", "shake"},
        lines(SHAKE_LEMMA, SHOOK_NOUN_RARE, SHOOK_FORM_OF_SHAKE),
    )
    check(
        "order of lemma vs. inflected form does not matter",
        result_reordered.get("shook") == SHAKE_LEMMA["senses"][0]["glosses"][0],
        f"got {result_reordered.get('shook')!r}",
        problems,
    )

    # 3. A word with no form-of ambiguity keeps the old, simple behaviour:
    # first substantive sense in file order.
    plain = {"pos": "noun", "word": "harbour", "lang_code": "en",
              "senses": [{"glosses": ["A place of shelter for ships."]}]}
    plain_second = {"pos": "verb", "word": "harbour", "lang_code": "en",
                      "senses": [{"glosses": ["To keep a thought or feeling secretly in mind."]}]}
    result_plain = gl.build({"harbour"}, lines(plain, plain_second))
    check(
        "an unambiguous word is unaffected",
        result_plain.get("harbour") == "A place of shelter for ships.",
        f"got {result_plain.get('harbour')!r}",
        problems,
    )

    # 4. If the lemma a redirect points at never resolves (not in the
    # snapshot, or filtered out), the word is left unglossed rather than
    # silently falling back to the wrong homograph the redirect exists to
    # reject — the whole point of item 5b's fix.
    result_no_lemma = gl.build(
        {"shook"},
        lines(SHOOK_NOUN_RARE, SHOOK_FORM_OF_SHAKE),  # no SHAKE_LEMMA line at all
    )
    check(
        "an unresolved redirect leaves the word unglossed, not wrong",
        "shook" not in result_no_lemma,
        f"got {result_no_lemma.get('shook')!r}, expected no entry",
        problems,
    )

    # 5. Chained redirects (A form-of B form-of C) resolve through more than
    # one hop.
    a = {"pos": "verb", "word": "a-form", "lang_code": "en",
          "senses": [{"glosses": ["form of b-form"], "tags": ["form-of"], "form_of": [{"word": "b-form"}]}]}
    b = {"pos": "verb", "word": "b-form", "lang_code": "en",
          "senses": [{"glosses": ["form of c-lemma"], "tags": ["form-of"], "form_of": [{"word": "c-lemma"}]}]}
    c = {"pos": "verb", "word": "c-lemma", "lang_code": "en",
          "senses": [{"glosses": ["the real definition"]}]}
    result_chain = gl.build({"a-form", "b-form", "c-lemma"}, lines(a, b, c))
    check(
        "a two-hop redirect chain resolves to the base lemma",
        result_chain.get("a-form") == "the real definition",
        f"got {result_chain.get('a-form')!r}",
        problems,
    )

    # 6. The exact real-world shape: an ordinary sense sharing an entry with
    # nothing else (the "to pack ... in a shook" verb), *and* a separate
    # entry holding only form-of senses, *and* a noun entry with two
    # ordinary senses ahead of both. The redirect sense sits in its own
    # entry here, so it must win over the gloss an earlier, different entry
    # already set.
    result_real = gl.build(
        {"shook", "shake"},
        lines(SHOOK_REAL_NOUN, SHOOK_REAL_VERB_PACK, SHOOK_REAL_VERB_FORM_OF, SHOOK_REAL_ADJ, SHAKE_REAL_LEMMA),
    )
    check(
        "the real multi-entry, multi-sense shape resolves shook via shake",
        result_real.get("shook") == result_real.get("shake") == SHAKE_REAL_LEMMA["senses"][0]["glosses"][0],
        f"got shook={result_real.get('shook')!r}, shake={result_real.get('shake')!r}",
        problems,
    )

    # 7. The opposite shape, found only by testing the fix above against
    # real data: a *single* entry whose senses are ordinary throughout,
    # except one buried deep in the list carries a redirect tag. "tommy"
    # is exactly this: one noun entry, eight senses — senses[0] is the
    # ordinary "British infantryman" meaning; senses[5] is a rare
    # abbreviation ("Short for Tommy gun", tags include "alt-of"). A fix
    # that scans every sense in an entry for a redirect before accepting
    # any gloss (the first version of this fix) let senses[5] hijack
    # senses[0]'s correct, common answer — the redirect must only ever
    # win *across* entries, never pre-empt an earlier sense *within* the
    # same one.
    tommy_common = {
        "pos": "noun", "word": "tommy", "lang_code": "en",
        "senses": [
            {"glosses": ["A British infantryman, especially one from World War I."], "tags": ["UK", "slang"]},
            {"glosses": ["Bread or breadlike foodstuff."], "tags": ["UK", "obsolete", "slang"]},
            {"glosses": ["The supply of food carried by workmen as their daily allowance."], "tags": ["UK", "obsolete", "slang"]},
            {"glosses": ["A truck, or barter of labour for goods."], "tags": ["UK", "obsolete", "slang"]},
            {"glosses": ["A tommy bar."], "tags": []},
            {"glosses": ["Short for Tommy gun"], "tags": ["abbreviation", "alt-of"], "alt_of": [{"word": "Tommy gun"}]},
            {"glosses": ["Tommyrot; nonsense."], "tags": ["dated", "slang"]},
            {"glosses": ["Synonym of dicky."], "tags": ["obsolete", "slang"]},
        ],
    }
    result_tommy = gl.build({"tommy"}, lines(tommy_common))
    check(
        "a rare redirect sense deep in one entry does not preempt an earlier ordinary sense",
        result_tommy.get("tommy") == "A British infantryman, especially one from World War I.",
        f"got {result_tommy.get('tommy')!r}",
        problems,
    )

    if problems:
        print(f"{len(problems)} failure(s):", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    print("glosses.py resolves form-of/alt-of redirects correctly (7/7 checks).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
