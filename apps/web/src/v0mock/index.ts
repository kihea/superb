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
//   - Quoted literary text is real and out of copyright. It lives in five
//     places, and nowhere else: `books[].opening`, `wholeBookParts`,
//     `elevatedTiers[].passage`, `shareable` and `voice`. (The first
//     version of this list said four and left `voice` out, which is three
//     lines of Washington rendered on /voice -- so read the sentence below
//     as being about this list too, and count the fields rather than
//     trusting it.) Each carries the work it
//     came from. Quote them exactly -- a paraphrase under an author's name
//     is the one thing in this file that would be a lie rather than a
//     placeholder, and nothing in the build checks it. (An earlier version
//     of this header named `elevatedPassages`, which has never existed,
//     and mentioned none of the other three. That is how a shortened
//     Washington sentence sat under his name for a round.)
//   - Rhymes, fields, tile relations and one-line meanings are small
//     hand-written sets. They are NOT the engine's, and no schedule,
//     difficulty or word-selection judgment in this file is the real one.
//   - The voice does not exist. Nothing here synthesises audio.
//   - One older source of invented data lives outside this file:
//     `src/fixtures/glosses` still supplies the gloss card's definitions,
//     and says so on screen.
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
// One book, one place in it. The Shelf and the share card used to say
// Chapter I while the book itself said Chapter II, so they are derived from
// one string now rather than written twice. The first attempt at that
// unified them on the wrong value: both of Kihea's frames say Chapter I
// (1h's Shelf line, 1v's share card), and the cabin, the cat-hole and the
// potato-hole are chapter one's, so "Boyhood days" -- which is genuinely
// Washington's chapter two -- was a heading over the wrong text.
const WASHINGTON_CHAPTER = "Chapter I";
const WASHINGTON_CHAPTER_TITLE = "A Slave Among Slaves";

// Quoted once, used twice: the book renders it and the share card sends it.
// Two hand-typed copies is how they came to differ.
const WASHINGTON_POTATO_HOLE =
  "An impression of this potato-hole is very distinctly engraved upon my memory, because I recall that during the process of putting the potatoes in or taking them out I would often come into possession of one or two, which I roasted and thoroughly enjoyed.";

export const shelf = {
  current: { id: "up-from-slavery", part: WASHINGTON_CHAPTER, note: "the cabin, the cat-hole" },
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
    label: "I",
    place: `${WASHINGTON_CHAPTER} · ${WASHINGTON_CHAPTER_TITLE}`,
    blocks: [
      [
        "There was no wooden floor in our cabin, the naked earth being used as a floor. In the centre of the earthen floor there was a large, deep opening covered with boards, which was used as a place in which to store sweet potatoes during the winter.",
      ],
      [WASHINGTON_POTATO_HOLE],
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

// ── Association: the puzzle board (screen 9, frame 3d) ──────────────────
// Nine tiles to a field. An unsolved tile gives away its first letter and
// its length and nothing else -- "the board tells you exactly how much you
// don't know", in Kihea's note under the frame. A solved tile shows how the
// word touches the field, and a word worth having gets one line of meaning
// when it lands: the vocabulary payload the puzzle games never carry.
//
// The ninth word of each field is the rare one. Its tile stays dashed and
// unlettered until it is solved -- a bonus, never a requirement.
//
// This replaces the two turn-2 association designs the track originally
// named (2e's field list and 2f's recited chain). Both are still in the
// canvas if either is ever wanted back.

export interface AssociationWord {
  word: string;
  /** How it touches the field, in 3d's own two words. */
  link: "involves" | "relates";
  /** One line, shown when the word lands. Only where a reader would want it. */
  meaning?: string;
}

export interface AssociationField {
  name: string;
  tier: Tier;
  /** Nine, in the order a reader is likely to reach them; the last is rare. */
  words: AssociationWord[];
}

export const associationFields: AssociationField[] = [
  {
    name: "The forge",
    tier: "Uncommon",
    words: [
      { word: "anvil", link: "involves" },
      { word: "bellows", link: "involves", meaning: "a bag that blows air onto a fire" },
      { word: "temper", link: "relates", meaning: "to harden metal by heating and cooling it" },
      { word: "quench", link: "involves", meaning: "to cool hot metal in water" },
      { word: "smelt", link: "relates", meaning: "to melt ore to get the metal out of it" },
      { word: "forge", link: "involves" },
      { word: "bloom", link: "relates", meaning: "a lump of iron fresh out of the furnace" },
      { word: "tongs", link: "involves" },
      { word: "slag", link: "relates", meaning: "the waste that floats off molten metal" },
    ],
  },
  {
    name: "Weather at sea",
    tier: "Sharp",
    words: [
      { word: "squall", link: "involves", meaning: "a short, violent burst of wind" },
      { word: "swell", link: "involves" },
      { word: "gale", link: "involves" },
      { word: "trough", link: "relates", meaning: "the low water between two waves" },
      { word: "leeward", link: "relates", meaning: "the side away from the wind" },
      { word: "doldrums", link: "involves", meaning: "a belt of sea where the wind dies" },
      { word: "reef", link: "relates", meaning: "to shorten a sail in heavy weather" },
      { word: "spume", link: "involves", meaning: "froth on a rough sea" },
      { word: "spindrift", link: "relates", meaning: "spray blown off the tops of waves" },
    ],
  },
  {
    name: "Courts and law",
    tier: "Rare",
    words: [
      { word: "writ", link: "involves", meaning: "a written order from a court" },
      { word: "bench", link: "relates" },
      { word: "docket", link: "involves", meaning: "the list of cases waiting to be heard" },
      { word: "chattel", link: "relates", meaning: "a piece of movable property" },
      { word: "tort", link: "involves", meaning: "a wrong you can be sued for" },
      { word: "assize", link: "involves", meaning: "a court session held periodically in a county" },
      { word: "affidavit", link: "relates", meaning: "a statement sworn to be true" },
      { word: "recusal", link: "relates", meaning: "a judge standing down from a case" },
      { word: "estoppel", link: "involves", meaning: "being held to what you earlier claimed" },
    ],
  },
  {
    name: "Grief and mourning",
    tier: "Difficult",
    words: [
      { word: "wake", link: "involves" },
      { word: "elegy", link: "involves", meaning: "a poem written for someone who died" },
      { word: "dirge", link: "relates", meaning: "a slow song of mourning" },
      { word: "shroud", link: "involves", meaning: "the cloth a body is wrapped in" },
      { word: "keening", link: "involves", meaning: "wailing aloud for the dead" },
      { word: "requiem", link: "relates", meaning: "a mass sung for the dead" },
      { word: "cortege", link: "involves", meaning: "a funeral procession" },
      { word: "bereft", link: "relates", meaning: "left without someone" },
      { word: "obsequies", link: "involves", meaning: "the rites at a funeral" },
    ],
  },
];

/** The board is nine tiles; the ninth is the rare one. */
export const RARE_TILE_INDEX = 8;

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
// Frame 2k draws this sentence shortened -- "I recall that" removed and the
// closing clause dropped, with no ellipsis -- and the first pass copied the
// frame. A design canvas may paraphrase; a card going to another person
// under Booker T. Washington's name may not. This is the sentence as he
// wrote it, and it is the same string the book itself renders.
export const shareable = {
  sentence: WASHINGTON_POTATO_HOLE,
  book: "Up from Slavery",
  attribution: `Booker T. Washington · ${WASHINGTON_CHAPTER}`,
};

// ── The voice (screen 7) ─────────────────────────────────────────────────
// No audio is produced. These are the states the orb can be put into so the
// shape of asking to be read to can be walked.
// These three lines are quoted text and were missing from the enumeration
// at the top of this file, in the same round that added the enumeration.
// `afterSpoken` was also the potato-hole sentence cut at "memory." and shown
// as a whole paragraph, which is the truncation the header warns about, one
// field away from where it warns about it. It reads the full sentence now,
// and the screen carries the attribution the passage behind a sheet still
// deserves.
export const voice = {
  paidName: "Wren",
  /** The paragraph the reader asked to have read, in 2b's speaking state. */
  spokenParagraph:
    "In the centre of the earthen floor there was a large, deep opening covered with boards, which was used as a place in which to store sweet potatoes during the winter.",
  beforeSpoken: "There was no wooden floor in our cabin, the naked earth being used as a floor.",
  afterSpoken: WASHINGTON_POTATO_HOLE,
  attribution: `Booker T. Washington, Up from Slavery · ${WASHINGTON_CHAPTER}`,
};
