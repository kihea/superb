"""Authoring source of truth for content/classes/*.json.

This is not validated content itself (leading underscore, not *.json) — it is
the table a human edits when a class needs a new member or a tighter fixture.
Editing a class means editing this table and re-running it, not hand-editing
the generated JSON, so 40 files never drift out of sync with one another's
conventions.

Run: python content/classes/_seed.py
"""

import json
import pathlib

HERE = pathlib.Path(__file__).parent

# Each fixture puts {word} in a syntactic position that disambiguates part of
# speech for an off-the-shelf tagger (determiner+ADJ+noun; verb+ADV; a
# determiner-headed noun slot; a to-infinitive for verbs) — see
# content/scripts/check_classes.py for why that matters and what it actually
# proves.
CLASSES = [
    # -- adjectives --------------------------------------------------------
    ("adj.quality.light", "adj",
     "The character of ambient light itself (a grey light, an amber light) — "
     "not the colour of an object lit by it.",
     "It was a {word} light over the harbour.",
     ["grey", "pale", "amber", "silver", "hazy", "milky", "leaden", "wan",
      "ashen", "coppery", "ruddy", "waxen", "ochre", "bronze"]),

    ("adj.state.secure", "adj",
     "Held fast against a force (tide, strain, weather) — not merely 'safe' "
     "in the abstract.",
     "It was a {word} knot, fit for the weather.",
     ["steady", "secure", "firm", "taut", "snug", "braced", "fixed",
      "tethered", "fast", "wedged", "stable"]),

    ("adj.quality.dark", "adj",
     "The character of failing or absent light over a scene, not a mood.",
     "It was a {word} sky before the rain.",
     ["gloomy", "murky", "sombre", "shadowed", "dusky", "inky", "sooty",
      "dim", "overcast", "bleak"]),

    ("adj.emotion.wary", "adj",
     "A guarded, uneasy disposition toward something not yet trusted — not "
     "fear itself.",
     "She gave a {word} glance toward the door.",
     ["uneasy", "apprehensive", "wary", "guarded", "suspicious",
      "distrustful", "hesitant", "nervous", "anxious", "watchful", "timid",
      "skittish"]),

    ("adj.emotion.content", "adj",
     "An settled, untroubled ease — not excitement, not relief from something.",
     "It was a {word} afternoon, and nobody hurried.",
     ["serene", "content", "tranquil", "placid", "untroubled", "unruffled",
      "composed", "settled", "peaceful", "mellow"]),

    ("adj.size.small", "adj",
     "Small enough to be dismissed or overlooked — quantity or scale read as "
     "insignificant, not merely compact.",
     "It was a {word} sum, hardly worth mentioning.",
     ["slight", "meagre", "scant", "modest", "diminutive", "puny", "paltry",
      "minute", "trifling", "negligible"]),

    ("adj.size.large", "adj",
     "Scale that overwhelms the ordinary — not merely 'big', but large enough "
     "to be remarked on.",
     "It was a {word} structure, built to be seen from the road.",
     ["vast", "immense", "colossal", "monumental", "sprawling", "expansive",
      "cavernous", "towering", "boundless", "prodigious", "mammoth",
      "gargantuan"]),

    ("adj.texture.rough", "adj",
     "A surface that resists the hand — irregular, unworked, or worn coarse.",
     "It was a {word} surface, unfit for bare feet.",
     ["coarse", "jagged", "rugged", "craggy", "gritty", "knotted",
      "weathered", "flinty", "calloused", "gnarled", "uneven",
      "abrasive"]),

    ("adj.texture.smooth", "adj",
     "A surface that yields easily to the hand or the eye — polished, even, "
     "unbroken.",
     "It was a {word} surface, cool beneath the hand.",
     ["sleek", "glassy", "polished", "silken", "burnished", "glossy",
      "unblemished", "satiny", "lustrous", "even", "flawless"]),

    ("adj.speed.slow", "adj",
     "A pace read as unhurried or reluctant — not merely low velocity, but "
     "the manner of moving slowly.",
     "It was a {word} pace, in no hurry to arrive.",
     ["sluggish", "languid", "unhurried", "plodding", "leisurely",
      "deliberate", "ponderous", "torpid", "lumbering", "gradual"]),

    ("adj.speed.fast", "adj",
     "A pace read as urgent or eager — the manner of moving quickly.",
     "It was a {word} pace, set to outrun the weather.",
     ["brisk", "swift", "hasty", "nimble", "fleet", "rapid", "headlong",
      "breakneck", "quick", "spry"]),

    ("adj.quality.old", "adj",
     "Age that shows as wear on a thing, not a person's years.",
     "It was a {word} building, long past its best years.",
     ["weathered", "timeworn", "ancient", "venerable", "decrepit",
      "antiquated", "threadbare", "faded", "rickety", "battered",
      "dilapidated"]),

    ("adj.quality.warm", "adj",
     "Comfortable heat, in weather or air — not emotional warmth.",
     "It was a {word} evening, the kind that invites a walk.",
     ["balmy", "mild", "temperate", "sultry", "tepid", "summery", "torrid",
      "sweltering", "clement", "humid"]),

    ("adj.quality.cold", "adj",
     "Cold read in weather or air as a physical bite, not as emotional "
     "distance.",
     "It was a {word} morning, the kind that bites at the fingers.",
     ["chilly", "frigid", "bitter", "raw", "icy", "wintry", "glacial",
      "nipping", "arctic", "keen"]),

    # -- adverbs -------------------------------------------------------------
    ("adv.manner.still", "adv",
     "Without motion or sound — how a thing rests, not how it feels.",
     "They lay {word} at their moorings.",
     ["quietly", "silently", "motionlessly", "soundlessly", "placidly",
      "tranquilly", "peacefully", "languorously", "listlessly"]),

    ("adv.manner.hesitant", "adv",
     "How an action is carried out when trust or confidence is missing.",
     "She reached for the handle {word}.",
     ["warily", "cautiously", "hesitantly", "gingerly", "tentatively",
      "uneasily", "guardedly", "timidly", "reluctantly"]),

    ("adv.manner.forceful", "adv",
     "How an action lands when carried out with unchecked force.",
     "He shut the door {word}.",
     ["forcefully", "fiercely", "violently", "roughly", "savagely",
      "brutally", "relentlessly", "ferociously", "vehemently"]),

    ("adv.degree.slightly", "adv",
     "A small margin of change or difference — modifies a comparative or a "
     "change, not a verb of motion.",
     "The room had grown {word} colder.",
     ["faintly", "slightly", "marginally", "barely", "scarcely",
      "imperceptibly", "minutely", "somewhat"]),

    ("adv.time.suddenly", "adv",
     "An event's arrival with no lead time — how abruptly it happens, not how "
     "it feels.",
     "The door opened {word}.",
     ["abruptly", "suddenly", "unexpectedly", "instantly", "immediately",
      "precipitously", "startlingly", "unaccountably"]),

    ("adv.manner.gracefully", "adv",
     "Motion that reads as unforced and well-formed.",
     "She crossed the room {word}.",
     ["gracefully", "elegantly", "smoothly", "daintily", "effortlessly",
      "buoyantly", "airily", "nimbly"]),

    ("adv.manner.grimly", "adv",
     "How something is said or done when the mood is severe or resigned.",
     "He spoke {word} of what he had seen.",
     ["grimly", "sternly", "gravely", "solemnly", "dourly", "stonily",
      "coldly", "severely", "harshly", "bleakly"]),

    ("adv.frequency.rarely", "adv",
     "How seldom something recurs — a frequency judgment, not a probability "
     "one.",
     "They {word} spoke of the matter again.",
     ["rarely", "seldom", "infrequently", "sporadically", "intermittently",
      "fitfully", "irregularly", "uncommonly"]),

    # -- nouns -----------------------------------------------------------
    ("noun.abstract.emotion.dread", "noun",
     "An anticipatory unease about what is coming, not fear of what is "
     "already present.",
     "A quiet {word} settled over the room.",
     ["dread", "foreboding", "unease", "apprehension", "disquiet",
      "misgiving", "trepidation", "anxiety", "dismay", "wariness"]),

    ("noun.abstract.emotion.joy", "noun",
     "A settled gladness, not a burst of excitement.",
     "A quiet {word} settled over the room.",
     ["delight", "elation", "gladness", "mirth", "exuberance", "jubilation",
      "rapture", "contentment", "gaiety", "buoyancy"]),

    ("noun.abstract.concept.fate", "noun",
     "An outcome attributed to forces beyond the actor's control.",
     "It was, perhaps, a matter of {word}.",
     ["fate", "destiny", "providence", "fortune", "chance", "circumstance",
      "happenstance", "doom", "reckoning"]),

    ("noun.abstract.quality.silence", "noun",
     "An absence of sound thick enough to be noticed as a presence.",
     "A heavy {word} filled the hall.",
     ["silence", "stillness", "hush", "quiet", "calm", "quietude",
      "tranquility", "muteness", "lull"]),

    ("noun.place.dwelling", "noun",
     "A modest, lived-in structure a person calls home — not a public or "
     "grand building.",
     "They came at last to a small {word} at the road's end.",
     ["cottage", "dwelling", "homestead", "tenement", "lodging", "abode",
      "hovel", "manor", "farmhouse", "shanty"]),

    ("noun.place.wild", "noun",
     "Land unshaped by cultivation — open, untended country.",
     "The path gave out onto open {word}.",
     ["wilderness", "moor", "thicket", "marsh", "heath", "woodland",
      "tundra", "scrubland", "hinterland"]),

    ("noun.object.vessel", "noun",
     "A small-to-mid craft that travels on water, named by type.",
     "A small {word} rocked gently at the pier.",
     ["vessel", "skiff", "schooner", "dinghy", "barge", "sloop", "ketch",
      "trawler", "longboat"]),

    ("noun.object.tool", "noun",
     "A handheld thing made to do a task — generic enough to fit many hands.",
     "He reached for the nearest {word}.",
     ["implement", "tool", "instrument", "apparatus", "contrivance",
      "device", "mechanism", "appliance", "contraption"]),

    ("noun.person.stranger", "noun",
     "A person read as not belonging to the place they are in — unfamiliarity "
     "as the whole content of the word.",
     "A {word} stood at the edge of the yard.",
     ["stranger", "wanderer", "vagrant", "wayfarer", "drifter", "itinerant",
      "transient", "interloper", "newcomer", "outsider"]),

    ("noun.abstract.time.era", "noun",
     "A stretch of time long enough to be named as a period, not a moment.",
     "It belonged to another {word} entirely.",
     ["epoch", "era", "age", "interval", "span", "interlude", "aeon",
      "chapter", "season"]),

    ("noun.abstract.sound", "noun",
     "A sudden, disordered noise — not a single tone and not music.",
     "A sudden {word} broke the quiet.",
     ["clamor", "din", "clatter", "racket", "uproar", "tumult", "hubbub",
      "commotion", "rustle", "patter"]),

    # -- verbs -------------------------------------------------------------
    ("verb.motion.slow", "verb",
     "Unhurried self-propelled motion, on foot.",
     "They chose to {word} along the shore.",
     ["amble", "trudge", "plod", "shuffle", "meander", "dawdle", "saunter",
      "wander", "drift", "straggle"]),

    ("verb.motion.fast", "verb",
     "Urgent self-propelled motion, on foot.",
     "They had to {word} across the yard.",
     ["dash", "bolt", "sprint", "hurtle", "race", "dart", "scramble",
      "careen", "rush"]),

    ("verb.perception.notice", "verb",
     "To become aware of something faint or easy to miss, by sight.",
     "It was easy to {word} the change in her face.",
     ["glimpse", "discern", "detect", "spy", "perceive", "espy", "observe",
      "notice", "descry", "remark"]),

    ("verb.communication.murmur", "verb",
     "To speak at low volume, half to oneself.",
     "She began to {word} something under her breath.",
     ["murmur", "whisper", "mutter", "mumble", "intone", "drawl", "croon",
      "drone"]),

    ("verb.state.change.fade", "verb",
     "To lessen gradually toward absence.",
     "The light began to {word} behind the hills.",
     ["fade", "dwindle", "wane", "diminish", "ebb", "recede", "dissolve",
      "wither", "subside", "dissipate"]),

    ("verb.state.change.grow", "verb",
     "To increase gradually in force or presence.",
     "The wind began to {word} as the afternoon wore on.",
     ["swell", "intensify", "mount", "deepen", "thicken", "freshen",
      "quicken", "gather"]),

    ("verb.motion.approach", "verb",
     "To close distance toward something, on foot or by craft.",
     "They began to {word} across the field.",
     ["approach", "near", "advance", "edge", "creep", "steal", "press",
      "loom"]),
]


def main() -> None:
    seen_ids = set()
    for class_id, pos, description, fixture, members in CLASSES:
        assert class_id not in seen_ids, f"duplicate id {class_id}"
        seen_ids.add(class_id)
        assert 8 <= len(members) <= 25, f"{class_id} has {len(members)} members"
        assert "{word}" in fixture, f"{class_id} fixture missing placeholder"
        doc = {
            "id": class_id,
            "pos": pos,
            "description": description,
            "fixture": fixture,
            "members": members,
        }
        out_path = HERE / f"{class_id}.json"
        out_path.write_text(
            json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
    print(f"wrote {len(CLASSES)} class files")


if __name__ == "__main__":
    main()
