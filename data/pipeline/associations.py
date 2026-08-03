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
coin: for every word that connects to any prompt at all, it lists which
prompts it answers, so a typed answer far outside the top 20 is still
honoured.

The judge is deliberately wider than the reveal. A person playing "crisis"
who answers "danger" is right, even though WordNet holds no direct edge
between them. So beyond the direct relations and PMI_CONNECTED corpus
pairs, the index also accepts:

  - hypernyms and hyponyms two levels out, not just one;
  - content words from the prompt's own definitions ("... of extreme
    danger or difficulty" is why danger answers crisis);
  - cousins — words whose senses share an ancestor with the prompt within
    three levels on each side (panic and crisis meet under "condition").
    Only the prompt's first few senses join this loosest tier, the shared
    ancestor must sit well below the taxonomy's vacuous roots ("entity",
    "act", "state" and kin prove nothing), and the cousin itself must be
    a reasonably common word;
  - corpus pairs at the looser PMI_JUDGE threshold.

The reveal's top-20 lists stay strict; only the index is generous.

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
# a word's tenth sense count for less than its first anyway. Ten, up from
# six: "strike" keeps its boxing, bowling and baseball lives well past its
# sixth sense, and a reader who answers from one of them is right.
MAX_SENSES = 10
SENSE_DISCOUNT = 0.25

# Corpus co-occurrence knobs.
WINDOW = 10
MIN_PAIR_COUNT = 3
MIN_TOKEN_COUNT = 3
PMI_CONNECTED = 2.0  # counts as corpus-connected for ranking and flags
PMI_LABELLED = 3.0   # enough to appear in the reveal on corpus evidence alone
PMI_BONUS = 0.06     # per PMI bit, added to the blend for ranking
PMI_JUDGE = 1.0      # the judge's looser bar for accepting an answer

# Judge-widening knobs (index only; the reveal never uses these).
JUDGE_LEVELS = 2         # hypernyms/hyponyms this many levels out
COUSIN_SENSES = 5        # only a word's dominant senses join the cousin tier
COUSIN_LEVELS = 3        # shared ancestor within this many levels each side
COUSIN_MIN_DEPTH = 4     # ancestors nearer the taxonomy root prove nothing
COUSIN_MIN_ZIPF = 2.7    # a cousin must be a word people actually use

# Ancestors that connect everything to everything, whatever their depth.
VACUOUS_ANCESTORS = {
    "entity", "physical_entity", "abstraction", "object", "whole", "artifact",
    "act", "action", "activity", "event", "state", "attribute", "quality",
    "person", "causal_agent", "organism", "animal", "plant", "thing",
    "matter", "substance", "relation", "communication", "measure", "group",
    "cognition", "content", "psychological_feature",
}

# Words that appear in definitions as glue or boilerplate, not meaning:
# "the act of...", "someone who...", "a state of being...".
DEFINITION_STOPWORDS = {
    "the", "and", "for", "that", "with", "from", "into", "onto", "which",
    "who", "whom", "whose", "this", "these", "those", "are", "was", "were",
    "been", "being", "has", "have", "had", "having", "not", "its", "his",
    "her", "their", "your", "our", "one", "two", "some", "any", "all",
    "other", "another", "such", "more", "most", "very", "than", "when",
    "where", "while", "usually", "especially", "typically", "often",
    "sometimes", "act", "state", "quality", "condition", "someone",
    "something", "somebody", "anything", "person", "people", "make",
    "makes", "making", "made", "used", "use", "uses", "using", "cause",
    "causes", "caused", "causing", "become", "becomes", "becoming",
    "characterized", "relating", "involving", "concerning", "regarded",
    "considered", "manner", "way", "kind", "sort", "form", "given",
    "marked", "etc",
}

# How a connection explains itself. Each label is built with the actual
# evidence — the defining line of the sense that makes the connection, the
# shared root, the domain — so the reveal teaches the *how*, not just a
# category ("a kind of it" told nobody anything they could keep).
GLOSS_TRIM = 88


def trim_gloss(text: str) -> str:
    text = text.strip().rstrip(".")
    if len(text) > GLOSS_TRIM:
        text = text[: GLOSS_TRIM - 1].rsplit(" ", 1)[0] + "…"
    return text


def label_for(relation: str, prompt: str, gloss: str | None) -> str:
    detail = f" — “{trim_gloss(gloss)}”" if gloss else ""
    if relation == "synonym":
        return f"means much the same{detail}"
    if relation == "antonym":
        return f"its opposite{detail}"
    if relation == "hyponym":
        return f"a kind of {prompt}{detail}"
    if relation == "hypernym":
        return f"{prompt} is a kind of this{detail}"
    if relation == "part":
        return f"part and whole{detail}"
    if relation == "substance":
        return f"what it's made of{detail}"
    if relation == "domain":
        return f"{prompt} has a whole sense that lives there{detail}"
    if relation == "defined":
        return f"defined through {prompt}{detail}"
    if relation == "defines":
        return f"inside {prompt}'s own meaning{detail}"
    if relation == "root":
        return gloss if gloss else "grown from the same root"
    return "keeps its company in our books"


# Relation strength before the sense discount; the order here is also the
# tiebreak when one word connects several ways.
WEIGHTS = {
    "synonym": 1.0,
    "antonym": 0.95,
    "hyponym": 0.7,
    "hypernym": 0.7,
    "part": 0.65,
    "substance": 0.65,
    "domain": 0.6,
    "defined": 0.55,
    "defines": 0.55,
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


def related_by_wordnet(word: str) -> dict[str, tuple[str, float, str | None]]:
    """associate -> (relation name, strength, the defining line of the sense
    that makes the connection), strongest occurrence kept. The gloss is what
    lets the reveal say HOW two words connect rather than only that they
    do."""
    from nltk.corpus import wordnet

    found: dict[str, tuple[str, float, str | None]] = {}

    def offer(other: str, relation: str, sense_index: int, gloss: str | None) -> None:
        other = other.lower()
        if "_" in other or not WORD_RE.match(other):
            return
        if other == word or is_inflection_of(other, word) or is_inflection_of(word, other):
            return
        strength = WEIGHTS[relation] / (1 + SENSE_DISCOUNT * sense_index)
        if other not in found or strength > found[other][1]:
            found[other] = (relation, strength, gloss)

    for index, synset in enumerate(wordnet.synsets(word)[:MAX_SENSES]):
        own_gloss = synset.definition()
        for lemma in synset.lemmas():
            if lemma.name().lower() != word:
                # The shared sense IS the connection: both words can mean this.
                offer(lemma.name(), "synonym", index, own_gloss)
                continue
            for antonym in lemma.antonyms():
                offer(antonym.name(), "antonym", index, antonym.synset().definition())
            for derived in lemma.derivationally_related_forms():
                offer(derived.name(), "root", index, None)
            for pertainym in lemma.pertainyms():
                offer(pertainym.name(), "root", index, None)
        for hyper in synset.hypernyms():
            for lemma in hyper.lemmas():
                offer(lemma.name(), "hypernym", index, hyper.definition())
        for hypo in synset.hyponyms():
            for lemma in hypo.lemmas():
                offer(lemma.name(), "hyponym", index, hypo.definition())
        for part in synset.part_meronyms() + synset.member_meronyms() \
                + synset.part_holonyms() + synset.member_holonyms():
            for lemma in part.lemmas():
                offer(lemma.name(), "part", index, part.definition())
        for substance in synset.substance_meronyms() + synset.substance_holonyms():
            for lemma in substance.lemmas():
                offer(lemma.name(), "substance", index, substance.definition())
        # The world a sense lives in: strike's tenpin sense carries a
        # bowling domain mark, and "bowling" is exactly what a player
        # answers. The gloss shown is the domained sense's own — the
        # thing the reader may not have known the word could mean.
        for domain in synset.topic_domains():
            for lemma in domain.lemmas():
                offer(lemma.name(), "domain", index, own_gloss)
    return found


SENSES_DB = Path("E:/se-work/kaikki/senses.sqlite")


def load_definition_web(eligible: set[str]) -> tuple[dict[str, list[tuple[str, str]]], dict[str, list[str]], dict[str, list[tuple[str, str]]]]:
    """Three read-side views of the dictionary itself (senses.py's store):

      reverse:  token -> [(word, definition)] for every eligible word whose
                definition uses the token — "punch: a hit or strike with
                one's fist" files punch under strike. How the judge honours
                an answer the taxonomy never drew an edge for.
      forward:  word -> its own definitions' content tokens — the other
                direction of the same handshake.
      roots:    word -> [(language, root)] — shared origins, for the labels
                that teach etymology.
    """
    import sqlite3

    reverse: dict[str, list[tuple[str, str]]] = {}
    forward: dict[str, list[str]] = {}
    roots: dict[str, list[tuple[str, str]]] = {}
    if not SENSES_DB.exists():
        print(f"  ({SENSES_DB} not found — definition crossing disabled)", file=sys.stderr)
        return reverse, forward, roots

    db = sqlite3.connect(SENSES_DB)
    for word, raw in db.execute("SELECT word, senses FROM senses"):
        if word not in eligible:
            continue
        tokens_here: set[str] = set()
        for sense in json.loads(raw):
            definition = sense["def"]
            if definition.startswith("Form of "):
                continue
            tokens = {
                t
                for t in TOKEN_RE.findall(definition.lower())
                if len(t) >= 3 and t not in DEFINITION_STOPWORDS
            }
            tokens_here |= tokens
            for token in tokens:
                bucket = reverse.setdefault(token, [])
                if len(bucket) < 400:  # "hit" is in thousands of definitions
                    bucket.append((word, definition))
        if tokens_here:
            forward[word] = sorted(tokens_here)
    for word, raw in db.execute("SELECT word, roots FROM roots"):
        if word in eligible:
            rows = [(lang, root) for lang, root in json.loads(raw) if len(root) >= 4]
            if rows:
                roots[word] = rows
    db.close()
    print(
        f"  definition web: {len(reverse)} tokens, {len(forward)} defined words, "
        f"{len(roots)} etymologies",
        file=sys.stderr,
    )
    return reverse, forward, roots


def shared_root(a: str, b: str, roots: dict[str, list[tuple[str, str]]]) -> tuple[str, str] | None:
    """The (language, root) two words share, when their recorded origins
    meet. Middle English restatements of the word itself prove nothing
    ("sound" from Middle English "sound"), so a root spelled exactly like
    either word is skipped."""
    for lang_a, root_a in roots.get(a, []):
        if root_a in (a, b):
            continue
        for lang_b, root_b in roots.get(b, []):
            if root_a == root_b and lang_a == lang_b:
                return (lang_a, root_a)
    return None


def judge_connections(
    word: str, pmi_related: dict[str, float], zipf,
    reverse: dict[str, list[tuple[str, str]]] | None = None,
) -> set[str]:
    """Every answer the judge should accept for this prompt — the widened
    net the module docstring describes. Index only; never the reveal."""
    from nltk.corpus import wordnet

    accepted: set[str] = set()
    cousins: set[str] = set()

    def offer(name: str, into: set[str]) -> None:
        name = name.lower()
        if "_" in name or not WORD_RE.match(name) or len(name) < 3:
            return
        if name == word or is_inflection_of(name, word) or is_inflection_of(word, name):
            return
        into.add(name)

    # Everything the reveal could have shown is accepted, of course.
    accepted.update(related_by_wordnet(word))

    synsets = wordnet.synsets(word)[:MAX_SENSES]
    for synset in synsets:
        for token in TOKEN_RE.findall(synset.definition().lower()):
            if token not in DEFINITION_STOPWORDS:
                offer(token, accepted)
        layer = {synset}
        for _ in range(JUDGE_LEVELS):
            layer = {h for s in layer for h in s.hypernyms() + s.instance_hypernyms()}
            for s in layer:
                for lemma in s.lemmas():
                    offer(lemma.name(), accepted)
        layer = {synset}
        for _ in range(JUDGE_LEVELS):
            layer = {h for s in layer for h in s.hyponyms()}
            for s in layer:
                for lemma in s.lemmas():
                    offer(lemma.name(), accepted)

    for synset in synsets[:COUSIN_SENSES]:
        ancestors: set = set()
        layer = {synset}
        for _ in range(COUSIN_LEVELS):
            layer = {h for s in layer for h in s.hypernyms() + s.instance_hypernyms()}
            ancestors.update(layer)
        for ancestor in ancestors:
            if ancestor.min_depth() < COUSIN_MIN_DEPTH:
                continue
            if ancestor.name().split(".")[0] in VACUOUS_ANCESTORS:
                continue
            layer = {ancestor}
            for _ in range(COUSIN_LEVELS):
                layer = {h for s in layer for h in s.hyponyms()}
                for s in layer:
                    for lemma in s.lemmas():
                        offer(lemma.name(), cousins)

    for other, value in pmi_related.items():
        if value >= PMI_JUDGE:
            offer(other, accepted)

    # Definition crossing, the other direction: any word whose own
    # dictionary line uses the prompt is answering from the meaning
    # itself — "punch: a hit or strike with one's fist" makes punch a
    # right answer to strike, whatever the taxonomy drew.
    if reverse:
        stems = {word}
        for pos in ("n", "v", "a"):
            base = wordnet.morphy(word, pos)
            if base:
                stems.add(base)
        for stem in stems:
            for other, _definition in reverse.get(stem, []):
                offer(other, accepted)

    accepted.update(w for w in cousins if zipf(w) >= COUSIN_MIN_ZIPF)
    return {w for w in accepted if zipf(w) >= 2.0}


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

    # The dictionary web: reverse and forward definition crossing, and
    # etymology roots — restricted to words common enough to be answers.
    eligible = {
        w for w in top_n_list("en", 60_000, wordlist="best") if WORD_RE.match(w) and len(w) >= 3
    }
    print("loading the definition web ...", file=sys.stderr)
    web_reverse, web_forward, web_roots = load_definition_web(eligible)

    print(f"scoring {len(candidates)} candidate prompts ...", file=sys.stderr)
    prompt_associates: dict[str, list[dict]] = {}
    for word in candidates:
        wn_related = related_by_wordnet(word)
        pmi_related = pmi.get(word, {})

        # Definition crossing joins the reveal too, both directions: the
        # commonest words defined *through* the prompt, and the content
        # words inside the prompt's own definitions.
        extra: dict[str, tuple[str, float, str | None]] = {}
        defined = sorted(
            (
                (other, definition)
                for other, definition in web_reverse.get(word, [])
                if other not in wn_related and zipf(other) >= 3.0
                and not is_inflection_of(other, word) and not is_inflection_of(word, other)
            ),
            key=lambda pair: (-zipf(pair[0]), pair[0]),
        )
        for other, definition in defined[:6]:
            extra[other] = ("defined", WEIGHTS["defined"], definition)
        defines = sorted(
            (
                t
                for t in web_forward.get(word, [])
                if t not in wn_related and t not in extra and zipf(t) >= 3.0
                and not is_inflection_of(t, word) and not is_inflection_of(word, t)
            ),
            key=lambda t: (-zipf(t), t),
        )
        for t in defines[:4]:
            extra[t] = ("defines", WEIGHTS["defines"], None)

        all_words = set(wn_related) | set(extra) | {
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
            relation, strength, detail = (
                wn_related.get(w) or extra.get(w) or ("corpus", 0.0, None)
            )
            value = pmi_related.get(w, 0.0)
            score = strength + PMI_BONUS * min(value, 10.0)
            # A shared origin upgrades the vaguer labels into a real
            # lesson: "both grown from Latin fenestra" beats "grown from
            # the same root" and beats "keeps its company" every time.
            root = shared_root(word, w, web_roots)
            if root and relation in ("root", "corpus", "defines"):
                connection = f"both grown from {root[0]} {root[1]}"
            else:
                connection = label_for(relation, word, detail)
            scored.append(
                {
                    "word": w,
                    "connection": connection,
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

    print("widening the judge's net for the chosen prompts ...", file=sys.stderr)
    connected = {
        w: judge_connections(w, pmi.get(w, {}), zipf, web_reverse) for w in sorted(used)
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
