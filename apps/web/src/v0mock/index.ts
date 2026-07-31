// ─────────────────────────────────────────────────────────────────────────
// MOCK DATA. Nothing in this file comes from the engine, the catalogue or
// any pipeline. It exists so the fourteen screens can be walked end to end
// before the services behind them exist, and it is the ONLY place in
// apps/web where invented data lives -- if a screen shows something that
// is not real, the reason is in this file.
//
// What is real here, and what is not:
//   - Book titles, authors, translators, chapter counts and publication
//     facts are real, and every book listed is out of copyright. They are
//     hand-written rather than read from the catalogue because the
//     catalogue is not in this repository yet.
//   - Passage text under `elevatedPassages` is real, quoted from the named
//     public-domain works.
//   - Rhymes, categories, association links and definitions are small
//     hand-written sets. They are NOT the engine's, and no schedule,
//     difficulty or word-selection judgment in this file is the real one.
//   - The voice does not exist. Nothing here synthesises audio.
// ─────────────────────────────────────────────────────────────────────────

export interface MockBook {
  id: string;
  title: string;
  author: string;
  translator?: string;
  /** As the reader would say it: "14 essays", "12 books", "17 chapters". */
  parts: string;
  blurb: string;
  /** The real opening line of the work. */
  opening: string;
  /** Cover treatment -- which of the palette's surfaces the cloth takes. */
  cloth: "brand" | "ink" | "support" | "soft" | "paper";
  moods: string[];
}

export const books: MockBook[] = [
  {
    id: "up-from-slavery",
    title: "Up from Slavery",
    author: "Booker T. Washington",
    parts: "17 chapters",
    blurb: "Born into slavery in Virginia; wrote this after founding a school.",
    opening: "I was born a slave on a plantation in Franklin County, Virginia.",
    cloth: "brand",
    moods: ["true", "short"],
  },
  {
    id: "souls-of-black-folk",
    title: "The Souls of Black Folk",
    author: "W. E. B. Du Bois",
    parts: "14 essays",
    blurb: "Essays on being Black in America after emancipation.",
    opening:
      "Between me and the other world there is ever an unasked question: unasked by some through feelings of delicacy.",
    cloth: "soft",
    moods: ["true", "argument"],
  },
  {
    id: "narrative-of-the-life",
    title: "Narrative of the Life of Frederick Douglass",
    author: "Frederick Douglass",
    parts: "11 chapters",
    blurb: "He taught himself to read, and then wrote this.",
    opening: "I was born in Tuckahoe, near Hillsborough, and about twelve miles from Easton, in Talbot county, Maryland.",
    cloth: "ink",
    moods: ["true", "short"],
  },
  {
    id: "walden",
    title: "Walden",
    author: "Henry David Thoreau",
    parts: "18 chapters",
    blurb: "Two years in a hut, argued at length.",
    opening:
      "When I wrote the following pages, or rather the bulk of them, I lived alone, in the woods, a mile from any neighbor.",
    cloth: "support",
    moods: ["argument", "strange"],
  },
  {
    id: "meditations",
    title: "Meditations",
    author: "Marcus Aurelius",
    translator: "George Long",
    parts: "12 books",
    blurb: "A Roman emperor's private notes to himself about staying decent under pressure.",
    opening: "From my grandfather Verus I learned good morals and the government of my temper.",
    cloth: "ink",
    moods: ["short", "true"],
  },
  {
    id: "middlemarch",
    title: "Middlemarch",
    author: "George Eliot",
    parts: "86 chapters",
    blurb: "A whole town, and everyone in it wanting something slightly different.",
    opening:
      "Miss Brooke had that kind of beauty which seems to be thrown into relief by poor dress.",
    cloth: "support",
    moods: ["argument"],
  },
  {
    id: "frankenstein",
    title: "Frankenstein",
    author: "Mary Shelley",
    parts: "24 chapters",
    blurb: "A man makes something, then cannot bear to look at it.",
    opening: "You will rejoice to hear that no disaster has accompanied the commencement of an enterprise.",
    cloth: "paper",
    moods: ["strange"],
  },
  {
    id: "jane-eyre",
    title: "Jane Eyre",
    author: "Charlotte Brontë",
    parts: "38 chapters",
    blurb: "Small, plain, and completely unwilling to be moved.",
    opening: "There was no possibility of taking a walk that day.",
    cloth: "ink",
    moods: ["true"],
  },
  {
    // Here so the poetry setting in screen 6 is reachable by reading a book
    // rather than by a switch nobody would find.
    id: "dickinson-poems",
    title: "Poems",
    author: "Emily Dickinson",
    parts: "3 parts",
    blurb: "Short, strange, and punctuated like nobody else.",
    opening: "“Hope” is the thing with feathers—",
    cloth: "paper",
    moods: ["short", "strange"],
  },
  {
    // And the same for the setting a play needs.
    id: "macbeth",
    title: "Macbeth",
    author: "William Shakespeare",
    parts: "5 acts",
    blurb: "A soldier is told what he will become, and sets about making it true.",
    opening: "When shall we three meet again in thunder, lightning, or in rain?",
    cloth: "brand",
    moods: ["strange", "short"],
  },
  {
    id: "the-odyssey",
    title: "The Odyssey",
    author: "Homer",
    translator: "Samuel Butler",
    parts: "24 books",
    blurb: "Ten years of trying to get home, and everyone in the way.",
    opening: "Tell me, O Muse, of that ingenious hero who travelled far and wide after he had sacked the famous town of Troy.",
    cloth: "support",
    moods: ["strange"],
  },
];

export function bookById(id: string): MockBook | undefined {
  return books.find((book) => book.id === id);
}

/** The shelf: one book being read, some waiting, some finished. */
export const shelf = {
  current: { id: "up-from-slavery", part: "Chapter I", note: "the cabin, the cat-hole" },
  waiting: ["middlemarch", "meditations", "souls-of-black-folk"],
  read: ["jane-eyre", "the-odyssey"],
};

export const libraryMoods = ["Short", "Grief", "Argument", "The sea"];

// ── Inside a whole book (screen 6) ───────────────────────────────────────
// One real chapter opening per shape, so the prose / poetry / play
// typography can be seen against text that actually has that shape.

export interface BookPart {
  shape: "prose" | "poetry" | "play";
  label: string;
  /** For prose: paragraphs. For poetry and plays: lines, grouped. */
  blocks: string[][];
  /** Plays only: who speaks each block. */
  speakers?: string[];
  place: string;
}

export const wholeBookParts: Record<string, BookPart> = {
  "up-from-slavery": {
    shape: "prose",
    label: "II",
    place: "Chapter II · Boyhood days",
    blocks: [
      [
        "There was no wooden floor in our cabin, the naked earth being used as a floor. In the centre of the earthen floor there was a large, deep opening covered with boards, which was used as a place in which to store sweet potatoes during the winter.",
      ],
      [
        "An impression of this potato-hole is very distinctly engraved upon my memory, because I recall that during the process of putting the potatoes in or taking them out I would often come into possession of one or two, which I roasted and thoroughly enjoyed.",
      ],
    ],
  },
  "dickinson-poems": {
    shape: "poetry",
    label: "XXXII",
    place: "Part One · Life",
    blocks: [
      [
        "“Hope” is the thing with feathers—",
        "That perches in the soul—",
        "And sings the tune without the words—",
        "And never stops—at all—",
      ],
      [
        "And sweetest—in the Gale—is heard—",
        "And sore must be the storm—",
        "That could abash the little Bird",
        "That kept so many warm—",
      ],
    ],
  },
  macbeth: {
    shape: "play",
    label: "Act II · Scene I",
    place: "Act II · Scene I",
    speakers: ["Macbeth", "Banquo"],
    blocks: [
      ["Is this a dagger which I see before me,", "The handle toward my hand? Come, let me clutch thee."],
      ["I have thee not, and yet I see thee still."],
    ],
  },
};

// ── The seven tiers, as 2d presents them ─────────────────────────────────
export const tiers = ["Plain", "Steady", "Sharp", "Uncommon", "Rare", "Difficult", "Formidable"] as const;
export type Tier = (typeof tiers)[number];

// ── Rhyme (screen 8) ─────────────────────────────────────────────────────
export interface RhymeRound {
  word: string;
  tier: Tier;
  /** Rhymes that share the stressed vowel and everything after it. */
  exact: string[];
  /** Near rhymes -- close enough to be worth having. */
  near: string[];
  /** One line of meaning for a word the reader is unlikely to have. */
  meanings: Record<string, string>;
}

export const rhymeRounds: RhymeRound[] = [
  {
    word: "hollow",
    tier: "Uncommon",
    exact: ["follow", "swallow", "wallow", "tallow", "gallows"],
    near: ["shadow", "meadow", "willow"],
    meanings: { tallow: "animal fat, once used for candles" },
  },
  {
    word: "ember",
    tier: "Steady",
    exact: ["member", "December", "remember", "timber"],
    near: ["amber", "umber", "somber"],
    meanings: { umber: "a brown earth pigment" },
  },
  {
    word: "quarry",
    tier: "Rare",
    exact: ["sorry", "lorry"],
    near: ["worry", "flurry", "tarry"],
    meanings: { tarry: "to linger, to be slow in leaving" },
  },
];

// ── Association, reading A: pick a field, find what belongs (2e) ─────────
export interface AssociationField {
  name: string;
  tier: Tier;
  /** In the order a reader is likely to reach them. */
  words: string[];
  /** Words that belong, but at arm's length. */
  looser: string[];
  meanings: Record<string, string>;
}

export const associationFields: AssociationField[] = [
  {
    name: "The forge",
    tier: "Uncommon",
    words: ["anvil", "bellows", "quench", "slag", "forge", "tongs"],
    looser: ["temper", "hammer", "smelt"],
    meanings: {
      quench: "to cool hot metal in water",
      slag: "the waste that floats off molten metal",
      temper: "to harden metal by heating and cooling it",
    },
  },
  {
    name: "Weather at sea",
    tier: "Sharp",
    words: ["squall", "swell", "gale", "doldrums", "spindrift"],
    looser: ["leeward", "reef", "trough"],
    meanings: {
      spindrift: "spray blown off the tops of waves",
      doldrums: "a belt of sea where the wind dies",
    },
  },
  {
    name: "Courts and law",
    tier: "Rare",
    words: ["writ", "assize", "chattel", "recusal", "tort"],
    looser: ["docket", "bench", "affidavit"],
    meanings: {
      assize: "a court session held periodically in a county",
      chattel: "a piece of movable property",
      recusal: "a judge standing down from a case",
    },
  },
  {
    name: "Grief and mourning",
    tier: "Difficult",
    words: ["elegy", "keening", "wake", "cortege", "shroud"],
    looser: ["dirge", "requiem", "bereft"],
    meanings: {
      cortege: "a funeral procession",
      keening: "wailing aloud for the dead",
      dirge: "a slow song of mourning",
    },
  },
];

// ── Association, reading B: one word, recite what touches it (2f) ────────
export interface AssociationSeed {
  word: string;
  tier: Tier;
  /** word -> how it touches the seed, in the three plain words 2f uses. */
  links: Record<string, "involves" | "relates" | "references">;
  /** Pairs that link to each other, not only to the seed -- 2f's chain. */
  chains: [string, string][];
  meanings: Record<string, string>;
}

export const associationSeeds: AssociationSeed[] = [
  {
    word: "iron",
    tier: "Uncommon",
    links: {
      anvil: "involves",
      rust: "relates",
      smelt: "involves",
      ore: "involves",
      "Iron Age": "references",
      forge: "involves",
      magnet: "relates",
    },
    chains: [
      ["smelt", "ore"],
      ["anvil", "forge"],
    ],
    meanings: { smelt: "to melt ore to get the metal out of it", ore: "rock with metal still in it" },
  },
  {
    word: "harbour",
    tier: "Sharp",
    links: {
      quay: "involves",
      mooring: "involves",
      tide: "relates",
      customs: "relates",
      breakwater: "involves",
    },
    chains: [["quay", "mooring"]],
    meanings: {
      quay: "a built landing place along the water",
      breakwater: "a wall that takes the force out of waves",
    },
  },
];

// ── Elevated passages (screen 10) ────────────────────────────────────────
// Two tiers written out in full, as the track asks. The text is real and
// out of copyright; the tier judgment is hand-made, not the engine's.

export interface ElevatedTier {
  name: string;
  /** The two authors named under the tier in 1r. */
  hint: string;
  passage: string[];
  source: string;
}

export const elevatedTiers: ElevatedTier[] = [
  {
    name: "Demanding",
    hint: "Stevenson, Eliot",
    source: "Robert Louis Stevenson, The Strange Case of Dr Jekyll and Mr Hyde (1886)",
    passage: [
      "Mr. Utterson the lawyer was a man of a rugged countenance, that was never lighted by a smile; cold, scanty and embarrassed in discourse; backward in sentiment; lean, long, dusty, dreary and yet somehow lovable.",
      "At friendly meetings, and when the wine was to his taste, something eminently human beaconed from his eye; something indeed which never found its way into his talk, but which spoke not only in these silent symbols of the after-dinner face.",
    ],
  },
  {
    name: "Dense",
    hint: "Melville, Hawthorne",
    source: "Herman Melville, Moby-Dick (1851)",
    passage: [
      "Consider the subtleness of the sea; how its most dreaded creatures glide under water, unapparent for the most part, and treacherously hidden beneath the loveliest tints of azure.",
      "Consider also the devilish brilliance and beauty of many of its most remorseless tribes, as the dainty embellished shape of many species of sharks.",
    ],
  },
  {
    name: "Ornate",
    hint: "Browne, Burton",
    source: "Sir Thomas Browne, Hydriotaphia, Urn Burial (1658)",
    passage: [
      "Now since these dead bones have already outlasted the living ones of Methuselah, and in a yard under ground, and thin walls of clay, outworn all the strong and specious buildings above it; and quietly rested under the drums and tramplings of three conquests.",
      "What Song the Syrens sang, or what name Achilles assumed when he hid himself among women, though puzzling questions, are not beyond all conjecture.",
    ],
  },
  { name: "Archaic", hint: "Browne, Burton", source: "", passage: [] },
  { name: "Latinate", hint: "Gibbon, Johnson", source: "", passage: [] },
  { name: "Labyrinthine", hint: "De Quincey, James", source: "", passage: [] },
  { name: "Formidable", hint: "Carlyle, Ruskin", source: "", passage: [] },
];

// ── The sentence a reader passes on (screen 14) ──────────────────────────
export const shareable = {
  before: "There was no wooden floor in our cabin, the naked earth being used as a floor.",
  sentence:
    "An impression of this potato-hole is very distinctly engraved upon my memory, because during the process of putting the potatoes in or taking them out I would often come into possession of one or two.",
  after: "There was no cooking-stove on our plantation.",
  book: "Up from Slavery",
  attribution: "Booker T. Washington · Chapter I",
};

// ── The voice (screen 7) ─────────────────────────────────────────────────
// No audio is produced. These are the states the orb can be put into so the
// shape of asking to be read to can be walked.
export const voice = {
  paidName: "Wren",
  /** The paragraph the reader asked to have read, in 2b's speaking state. */
  spokenParagraph:
    "In the centre of the earthen floor there was a large, deep opening covered with boards, which was used as a place in which to store sweet potatoes during the winter.",
  beforeSpoken: "There was no wooden floor in our cabin, the naked earth being used as a floor.",
  afterSpoken: "An impression of this potato-hole is very distinctly engraved upon my memory.",
};
