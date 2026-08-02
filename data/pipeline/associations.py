"""Association challenge data — writes content/challenges/association.json
and content/challenges/association-index.json.

Two clean sources, no external association norms:

1. WordNet 3.0 (Princeton, custom permissive licence — the copyright notice
   this data must carry is in data/NOTICE.md, and the manifest row is in
   data/MANIFEST.md). Relations used, with the plain label each one gets:

     synonyms                          "means the same"
     antonyms                          "opposite"
     hyponyms  (one level down)        "a kind of it"
     hypernyms (one level up)          "it is a kind of"
     part / member meronyms+holonyms   "part of it"
     substance meronyms+holonyms       "made from it"
     derivationally related, pertainym "comes from the same root"

2. Co-occurrence over our own corpus: the sourced excerpts in
   content/sources/*.json, all public domain. Windowed PMI (how much more
   often two words appear near each other than chance predicts), window of
   ten tokens, pairs seen at least three times. A word connected only this
   way is labelled "shows up beside it".

Each prompt carries up to 20 associates ranked by a blended score: the
strongest WordNet relation, discounted for rarer senses, plus a bonus for
corpus evidence. association-index.json is the judge's side of the same
coin: for every word that connects to any prompt at all — through any
WordNet relation above, or PMI at or above PMI_CONNECTED — it lists which
prompts it answers, so a typed answer far outside the top 20 is still
honoured.

Plain inflections of the prompt (call / called) are never associates; other
same-root words (call / caller) are allowed and say so.

Deterministic: WordNet 3.0 is a fixed dataset, the corpus is in the repo,
wordfreq is pinned, and every ordering ties off on the word itself.

Run: python data/pipeline/associations.py
"""

from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

from wordfreq import top_n_list, zipf_frequency

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SOURCES_DIR = REPO_ROOT / "content" / "sources"
OUT_DIR = REPO_ROOT / "content" / "challenges"

# Zipf bands, tier 1 (very common) to tier 7 (rare but real) — the same
# bands rhymes.py uses, so the two challenges grade rarity identically.
TIER_FLOORS = [5.2, 4.7, 4.2, 3.8, 3.5, 3.2, 2.5]

MIN_PER_TIER = 80
MAX_PER_TIER = 150
MIN_ASSOCIATES = 10
# A prompt also needs this many WordNet-sourced associates of its own.
# Corpus evidence alone can make anything look connected — "because" sits
# beside plenty of words — but a prompt must have a real meaning net.
MIN_WN_ASSOCIATES = 6
TOP_ASSOCIATES = 20

# Only this many senses of a word feed relations; the discount below makes
# a word's tenth sense count for less than its first anyway.
MAX_SENSES = 6
SENSE_DISCOUNT = 0.25

# Corpus co-occurrence knobs.
WINDOW = 10
MIN_PAIR_COUNT = 3
MIN_TOKEN_COUNT = 3
PMI_CONNECTED = 2.0  # enough to count as connected for the judge
PMI_LABELLED = 3.0   # enough to appear in the reveal on corpus evidence alone
PMI_BONUS = 0.06     # per PMI bit, added to the blend for ranking

LABELS = {
    "synonym": "means the same",
    "antonym": "opposite",
    "hyponym": "a kind of it",
    "hypernym": "it is a kind of",
    "part": "part of it",
    "substance": "made from it",
    "root": "comes from the same root",
    "corpus": "shows up beside it",
}

# Relation strength before the sense discount; the order here is also the
# tiebreak when one word connects several ways.
WEIGHTS = {
    "synonym": 1.0,
    "antonym": 0.95,
    "hyponym": 0.7,
    "hypernym": 0.7,
    "part": 0.65,
    "substance": 0.65,
    "root": 0.5,
}

WORD_RE = re.compile(r"[a-z]+$")
TOKEN_RE = re.compile(r"[a-z]+")
INFLECTION_TAILS = {"s", "es", "d", "ed", "ing"}


def ensure_wordnet() -> None:
    import nltk

    try:
        from nltk.corpus import wordnet

        wordnet.ensure_loaded()
    except LookupError:
        nltk.download("wordnet", quiet=True)


def is_inflection_of(word: str, base: str) -> bool:
    if not word.startswith(base[: max(3, len(base) - 1)]):
        return False
    for tail in INFLECTION_TAILS:
        if word == base + tail:
            return True
        if len(base) > 1 and word == base + base[-1] + tail:  # run / running
            return True
        if base.endswith("e") and word == base[:-1] + tail:   # bake / baking
            return True
        if base.endswith("y") and word == base[:-1] + "ie" + tail:  # try / tried
            return True
    return False


def related_by_wordnet(word: str) -> dict[str, tuple[str, float]]:
    """associate -> (relation name, strength), strongest occurrence kept."""
    from nltk.corpus import wordnet

    found: dict[str, tuple[str, float]] = {}

    def offer(other: str, relation: str, sense_index: int) -> None:
        other = other.lower()
        if "_" in other or not WORD_RE.match(other):
            return
        if other == word or is_inflection_of(other, word) or is_inflection_of(word, other):
            return
        strength = WEIGHTS[relation] / (1 + SENSE_DISCOUNT * sense_index)
        if other not in found or strength > found[other][1]:
            found[other] = (relation, strength)

    for index, synset in enumerate(wordnet.synsets(word)[:MAX_SENSES]):
        for lemma in synset.lemmas():
            if lemma.name().lower() != word:
                offer(lemma.name(), "synonym", index)
                continue
            for antonym in lemma.antonyms():
                offer(antonym.name(), "antonym", index)
            for derived in lemma.derivationally_related_forms():
                offer(derived.name(), "root", index)
            for pertainym in lemma.pertainyms():
                offer(pertainym.name(), "root", index)
        for hyper in synset.hypernyms():
            for lemma in hyper.lemmas():
                offer(lemma.name(), "hypernym", index)
        for hypo in synset.hyponyms():
            for lemma in hypo.lemmas():
                offer(lemma.name(), "hyponym", index)
        for part in synset.part_meronyms() + synset.member_meronyms() \
                + synset.part_holonyms() + synset.member_holonyms():
            for lemma in part.lemmas():
                offer(lemma.name(), "part", index)
        for substance in synset.substance_meronyms() + synset.substance_holonyms():
            for lemma in substance.lemmas():
                offer(lemma.name(), "substance", index)
    return found


def corpus_texts() -> list[str]:
    texts = []
    for path in sorted(SOURCES_DIR.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        text = doc.get("text", "")
        if text:
            texts.append(text)
    return texts


def cooccurrence() -> tuple[Counter, Counter, int, int]:
    """Lemma-level counts over the excerpt corpus: token counts, unordered
    pair counts within WINDOW tokens, total tokens, total pairs."""
    from nltk.stem import WordNetLemmatizer

    lemmatizer = WordNetLemmatizer()
    lemma_cache: dict[str, str] = {}

    def lemma_of(token: str) -> str:
        if token not in lemma_cache:
            noun = lemmatizer.lemmatize(token)
            lemma_cache[token] = (
                noun if noun != token else lemmatizer.lemmatize(token, "v")
            )
        return lemma_cache[token]

    token_counts: Counter = Counter()
    tokenized: list[list[str]] = []
    for text in corpus_texts():
        tokens = [lemma_of(t) for t in TOKEN_RE.findall(text.lower()) if len(t) >= 3]
        tokenized.append(tokens)
        token_counts.update(tokens)

    keep = {t for t, c in token_counts.items() if c >= MIN_TOKEN_COUNT}
    pair_counts: Counter = Counter()
    total_pairs = 0
    for tokens in tokenized:
        kept = [t for t in tokens if t in keep]
        for i, a in enumerate(kept):
            for b in kept[i + 1 : i + 1 + WINDOW]:
                if a == b:
                    continue
                pair_counts[(a, b) if a < b else (b, a)] += 1
                total_pairs += 1
    total_tokens = sum(token_counts[t] for t in keep)
    return token_counts, pair_counts, total_tokens, total_pairs


def pmi_table(
    token_counts: Counter, pair_counts: Counter, total_tokens: int, total_pairs: int
) -> dict[str, dict[str, float]]:
    """word -> {neighbour: PMI}, only for pairs seen MIN_PAIR_COUNT+ times
    with PMI at or above PMI_CONNECTED."""
    table: dict[str, dict[str, float]] = {}
    for (a, b), count in pair_counts.items():
        if count < MIN_PAIR_COUNT:
            continue
        p_pair = count / total_pairs
        p_a = token_counts[a] / total_tokens
        p_b = token_counts[b] / total_tokens
        pmi = math.log2(p_pair / (p_a * p_b))
        if pmi < PMI_CONNECTED:
            continue
        table.setdefault(a, {})[b] = round(pmi, 2)
        table.setdefault(b, {})[a] = round(pmi, 2)
    return table


def build() -> tuple[dict, dict]:
    ensure_wordnet()

    zipf_cache: dict[str, float] = {}

    def zipf(w: str) -> float:
        if w not in zipf_cache:
            zipf_cache[w] = zipf_frequency(w, "en", wordlist="best")
        return zipf_cache[w]

    print("counting co-occurrence over content/sources ...", file=sys.stderr)
    pmi = pmi_table(*cooccurrence())

    from nltk.corpus import wordnet

    def is_base_form(w: str) -> bool:
        """WordNet's own morphology says this surface IS its base form —
        so 'bagged' and 'abbreviated' never become prompts, while 'bag'
        and 'abbreviate' can."""
        for pos in ("n", "v", "a"):
            base = wordnet.morphy(w, pos)
            if base is not None and base != w:
                return False
        return True

    candidates = [
        w
        for w in top_n_list("en", 200_000, wordlist="best")
        if WORD_RE.match(w)
        and len(w) >= 3
        and zipf(w) >= TIER_FLOORS[-1]
        and is_base_form(w)
    ]

    print(f"scoring {len(candidates)} candidate prompts ...", file=sys.stderr)
    prompt_associates: dict[str, list[dict]] = {}
    connected: dict[str, set[str]] = {}
    for word in candidates:
        wn_related = related_by_wordnet(word)
        pmi_related = pmi.get(word, {})
        all_words = set(wn_related) | {
            w
            for w, value in pmi_related.items()
            if value >= PMI_LABELLED and WORD_RE.match(w) and len(w) >= 3
        }
        # An associate must be a word a reader could actually offer.
        all_words = {w for w in all_words if zipf(w) >= 2.0}
        wn_count = sum(1 for w in all_words if w in wn_related)
        if len(all_words) < MIN_ASSOCIATES or wn_count < MIN_WN_ASSOCIATES:
            continue

        scored = []
        for w in sorted(all_words):
            relation, strength = wn_related.get(w, ("corpus", 0.0))
            value = pmi_related.get(w, 0.0)
            score = strength + PMI_BONUS * min(value, 10.0)
            scored.append(
                {
                    "word": w,
                    "connection": LABELS[relation],
                    "wn": relation != "corpus",
                    "pmi": value >= PMI_CONNECTED,
                    "_score": score,
                }
            )
        scored.sort(key=lambda entry: (-entry["_score"], entry["word"]))
        prompt_associates[word] = [
            {k: v for k, v in entry.items() if k != "_score"}
            for entry in scored[:TOP_ASSOCIATES]
        ]
        # The judge accepts every WordNet relative and every PMI_CONNECTED
        # neighbour, not just the reveal's top 20.
        judged = set(wn_related) | {
            w for w, value in pmi_related.items() if value >= PMI_CONNECTED
        }
        connected[word] = {w for w in judged if zipf(w) >= 2.0}

    # Skip prompts that are plain inflections of another qualifying prompt,
    # so a tier doesn't spend two slots on adventurer and adventurers.
    def base_forms(w: str) -> list[str]:
        bases = []
        for suffix in ("ing", "ed", "es", "d", "s"):
            if w.endswith(suffix) and len(w) - len(suffix) >= 3:
                stem = w[: -len(suffix)]
                bases.extend([stem, stem + "e"])
        if w.endswith("ied") and len(w) >= 5:
            bases.append(w[:-3] + "y")
        return bases

    prompt_pool = {
        w: a
        for w, a in prompt_associates.items()
        if not any(b in prompt_associates for b in base_forms(w))
    }

    tiers: dict[str, list[dict]] = {}
    used: set[str] = set()
    for tier_index, floor in enumerate(TIER_FLOORS, start=1):
        ceiling = TIER_FLOORS[tier_index - 2] if tier_index > 1 else 99.0
        in_band = sorted(
            (w for w in prompt_pool if floor <= zipf(w) < ceiling),
            key=lambda w: (-zipf(w), w),
        )[:MAX_PER_TIER]
        if len(in_band) < MIN_PER_TIER:
            raise SystemExit(
                f"tier {tier_index} (Zipf {floor}-{ceiling}) has only "
                f"{len(in_band)} prompts with {MIN_ASSOCIATES}+ associates; "
                f"widen the band or loosen the associate filters."
            )
        used.update(in_band)
        tiers[str(tier_index)] = [
            {"word": w, "associates": prompt_associates[w]}
            for w in sorted(in_band)
        ]

    prompts_doc = {
        "sources": "WordNet 3.0 (Princeton) and co-occurrence over content/sources",
        "note": (
            "Association challenge prompts in seven tiers, tier 1 most "
            "common. Each associate names how it connects in plain words; "
            "wn and pmi say which source vouches for it. Generated by "
            "data/pipeline/associations.py. Do not hand-edit."
        ),
        "tiers": tiers,
    }

    prompt_list = sorted(used)
    prompt_index = {w: i for i, w in enumerate(prompt_list)}
    answers: dict[str, list[int]] = {}
    for prompt in prompt_list:
        for w in connected[prompt]:
            answers.setdefault(w, []).append(prompt_index[prompt])
    index_doc = {
        "prompts": prompt_list,
        "answers": {w: sorted(ids) for w, ids in sorted(answers.items())},
    }
    return prompts_doc, index_doc


def write(prompts_doc: dict, index_doc: dict) -> list[Path]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    prompts_path = OUT_DIR / "association.json"
    index_path = OUT_DIR / "association-index.json"
    prompts_path.write_text(
        json.dumps(prompts_doc, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    index_path.write_text(
        json.dumps(index_doc, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    return [prompts_path, index_path]


if __name__ == "__main__":
    prompts_doc, index_doc = build()
    for path in write(prompts_doc, index_doc):
        print(f"wrote {path}", file=sys.stderr)
    for tier, entries in prompts_doc["tiers"].items():
        print(f"tier {tier}: {len(entries)} prompts", file=sys.stderr)
    print(
        f"index: {len(index_doc['prompts'])} prompts, "
        f"{len(index_doc['answers'])} answer words",
        file=sys.stderr,
    )
