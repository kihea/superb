"""Authoring source of truth for content/sources/*.json.

Same convention as content/classes/_seed.py and content/passages/_seed.py:
edit this table, re-run it, and every generated file carries the same shape.

Every excerpt below was fetched directly from its Project Gutenberg plain-text
edition (not typed from memory) and cut by hand to 80-200 words at a clean
sentence boundary — the contributor-cuts-the-excerpt rule in ADR-018 Decision
3. `words` lists only the words each excerpt actually explains through its own
surrounding sentence; presence in the text is necessary and checked by
content/scripts/check_sources.py, but informativeness is the editorial
judgment spent here, by hand, once.

Run: python content/sources/_seed.py

DECISION PENDING: https://github.com/kihea/superb/issues/23 — this directory
is many files (content/sources/*.json), matching the frozen
docs/seams.md §Seam 2; ADR-018 Decision 4 names a single content/excerpts/
file instead. Built to the seam, which is what T3-content.md instructs.
"""

from __future__ import annotations

import json
import pathlib

HERE = pathlib.Path(__file__).parent
RETRIEVED = "2026-07-25"
# The public-domain basis, stated as the rule that actually applies and
# checked per work by data/pipeline/check_license_gate.py against the `year`
# in each record -- so this is one string here but a claim tested 2,599 times
# there, which is what ADR-008's "per work" asks for.
#
# It used to read "Public Domain (US, life+70 expired)", which was the wrong
# rule twice over. US copyright runs 95 years from publication for works of
# this era; life+70 applies to works created from 1978 onward. For most of
# these the conclusion was right by accident, and for one it was not:
# W. E. B. Du Bois died in 1963, so life+70 runs to 2033, and the excerpt from
# The Souls of Black Folk stated a justification that has not happened for a
# conclusion that is true anyway -- the book is public domain because it was
# published in 1903. A provenance record exists to be checked by a stranger,
# and that one did not survive being checked.
#
# If this string changes, change it in data/pipeline/excerpts.py too, and in
# the gate's VERIFIABLE_PUBLIC_DOMAIN_BASES -- the gate rejects any basis it
# does not know how to verify, so drift between the three fails CI rather than
# passing quietly.
#
# RESOLVED (issue #58): ADR-026 (53f52e9) gave every word a `signals`
# array and PR #64 pinned every citation URL to the fetched .txt.utf-8
# artifact and repaired or dropped several excerpts, all three applied to
# the JSON directly rather than through this script, so re-running it used
# to revert every one of those changes silently. Each word below now
# carries the signal(s) the committed JSON already records (transcribed,
# not recomputed — `gutenberg()`'s docstring has the URL fix), and the 6
# excerpts PR #64 dropped as unreconstructible are no longer listed here.
# Re-running this script and diffing content/sources/ is expected to show
# no changes.
LICENCE = "Public Domain (US: published before 1929)"

# ADR-022: the engine's topic-affinity table looks up a topic for every
# passage id it finished or abandoned, sourced or composed alike, so these
# 47 hand-picked excerpts need one too — added here, at generation time,
# rather than patched onto the JSON files directly, so re-running this
# script never drops it. One topic per *work* (see data/pipeline/excerpts.py
# for why a whole-book topic, not a per-excerpt one, is the honest unit).
WORK_TOPICS: dict[str, str] = {
    "A Tale of Two Cities": "war",
    "Adventures of Huckleberry Finn": "travel",
    "Alice's Adventures in Wonderland": "childhood",
    "Anna Karenina": "courtship",
    "Anne of Green Gables": "childhood",
    "Around the World in Eighty Days": "travel",
    "Crime and Punishment": "mystery",
    "David Copperfield": "city",
    "Dracula": "supernatural",
    "Emma": "household",
    "Ethan Frome": "rural",
    "Frankenstein; or, The Modern Prometheus": "invention",
    "Great Expectations": "city",
    "Gulliver's Travels": "travel",
    "Heart of Darkness": "wilderness",
    "Jane Eyre": "courtship",
    "Little Women": "household",
    "Middlemarch": "society",
    "Moby-Dick; or, The Whale": "sea",
    "My Ántonia": "wilderness",
    "Narrative of the Life of Frederick Douglass, an American Slave": "society",
    "Notes from Underground": "reflection",
    "Oliver Twist": "city",
    "Persuasion": "courtship",
    "Pride and Prejudice": "household",
    "Robinson Crusoe": "sea",
    "Silas Marner": "rural",
    "Strange Case of Dr Jekyll and Mr Hyde": "invention",
    "The Adventures of Sherlock Holmes": "mystery",
    "The Adventures of Tom Sawyer": "childhood",
    "The Awakening": "society",
    "The Call of the Wild": "wilderness",
    "The House of Mirth": "society",
    "The Picture of Dorian Gray": "supernatural",
    "The Scarlet Letter": "mourning",
    "The Secret Garden": "childhood",
    "The Souls of Black Folk": "society",
    "The Time Machine": "invention",
    "The Turn of the Screw": "supernatural",
    "The War of the Worlds": "invention",
    "The Yellow Wallpaper": "reflection",
    "Treasure Island": "sea",
    "Twenty Thousand Leagues Under the Sea": "sea",
    "Vanity Fair": "war",
    "Walden": "reflection",
    "White Fang": "wilderness",
    "Wuthering Heights": "courtship",
}


def gutenberg(n: int) -> tuple[str, str]:
    # The URL is the plain-text artifact the pipeline actually fetches and
    # searches (data/pipeline/excerpts.py's own gutenberg_text_url), not the
    # ebooks landing page — pinned here to match PR #64's corpus-wide fix.
    return f"Project Gutenberg #{n}", f"https://www.gutenberg.org/ebooks/{n}.txt.utf-8"


# id, work, author, year, gutenberg id, text, words (each word paired with
# the signal(s) that claimed it, ADR-026 — "hand-picked" is authored by
# definition; "apposition" and "gloss-overlap" are transcribed from the
# already-committed JSON, not recomputed, because the latter needs a
# networked artifact (data/out/glosses.json) this seed does not have
# offline — see issue #58)
SOURCES: list[tuple[str, str, str, int, int, str, list[tuple[str, tuple[str, ...]]]]] = [
    (
        'src-melville-call-me-ishmael',
        'Moby-Dick; or, The Whale', 'Herman Melville', 1851, 2701,
        "Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people's hats off—then, I account it high time to get to sea as soon as I can. This is my substitute for pistol and ball. With a philosophical flourish Cato throws himself upon his sword; I quietly take to the ship.",
        [("spleen", ('gloss-overlap', 'hand-picked')), ("hypos", ('hand-picked',))],
    ),
    (
        'src-melville-meditation-and-water',
        'Moby-Dick; or, The Whale', 'Herman Melville', 1851, 2701,
        "meditation and water are wedded for ever. But here is an artist. He desires to paint you the dreamiest, shadiest, quietest, most enchanting bit of romantic landscape in all the valley of the Saco. What is the chief element he employs? There stand his trees, each with a hollow trunk, as if a hermit and a crucifix were within; and here sleeps his meadow, and there sleep his cattle; and up from yonder cottage goes a sleepy smoke. Deep into distant woodlands winds a mazy way, reaching to overlapping spurs of mountains bathed in their hill-side blue. But though the picture lies thus tranced, and though this pine-tree shakes down its sighs like leaves upon this shepherd's head, yet all were vain, unless the shepherd's eye were fixed upon the magic stream before him. Go visit the Prairies in June, when for scores on scores of miles you wade knee-deep among Tiger-lilies—what is the one charm wanting?—Water—there is not a drop of water there! Were Niagara but a cataract of sand, would you travel your thousand miles to see it?",
        [("mazy", ('hand-picked',)), ("tranced", ('hand-picked',)), ("cataract", ('gloss-overlap', 'hand-picked'))],
    ),
    (
        'src-austen-truth-universally-acknowledged',
        'Pride and Prejudice', 'Jane Austen', 1813, 1342,
        'It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters. “My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?” Mr. Bennet replied that he had not. “But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.” Mr. Bennet made no answer.',
        [("fixed", ('hand-picked',))],
    ),
    (
        'src-shelley-birth-a-genevese',
        'Frankenstein; or, The Modern Prometheus', 'Mary Shelley', 1818, 84,
        'I am by birth a Genevese, and my family is one of the most distinguished of that republic. My ancestors had been for many years counsellors and syndics, and my father had filled several public situations with honour and reputation. He was respected by all who knew him for his integrity and indefatigable attention to public business. He passed his younger days perpetually occupied by the affairs of his country; a variety of circumstances had prevented his marrying early, nor was it until the decline of life that he became a husband and the father of a family. As the circumstances of his marriage illustrate his character, I cannot refrain from relating them. One of his most intimate friends was a merchant who, from a flourishing state, fell, through numerous mischances, into poverty. This man, whose name was Beaufort, was of a proud and unbending disposition and could not bear to live in poverty and oblivion in the same country where he had formerly been distinguished for his rank and magnificence.',
        [("syndics", ('hand-picked',)), ("indefatigable", ('hand-picked',)), ("unbending", ('hand-picked',))],
    ),
    (
        'src-shelley-dreary-night-of-november',
        'Frankenstein; or, The Modern Prometheus', 'Mary Shelley', 1818, 84,
        'It was on a dreary night of November that I beheld the accomplishment of my toils. With an anxiety that almost amounted to agony, I collected the instruments of life around me, that I might infuse a spark of being into the lifeless thing that lay at my feet. It was already one in the morning; the rain pattered dismally against the panes, and my candle was nearly burnt out, when, by the glimmer of the half-extinguished light, I saw the dull yellow eye of the creature open; it breathed hard, and a convulsive motion agitated its limbs. How can I describe my emotions at this catastrophe, or how delineate the wretch whom with such infinite pains and care I had endeavoured to form? His limbs were in proportion, and I had selected his features as beautiful. Beautiful! Great God!',
        [("toils", ('hand-picked',)), ("convulsive", ('hand-picked',)), ("delineate", ('hand-picked',))],
    ),
    (
        'src-stoker-castle-on-the-edge',
        'Dracula', 'Bram Stoker', 1897, 345,
        'The castle is on the very edge of a terrible precipice. A stone falling from the window would fall a thousand feet without touching anything! As far as the eye can reach is a sea of green tree tops, with occasionally a deep rift where there is a chasm. Here and there are silver threads where the rivers wind in deep gorges through the forests. But I am not in heart to describe beauty, for when I had seen the view I explored further; doors, doors, doors everywhere, and all locked and bolted. In no place save from the windows in the castle walls is there an available exit. The castle is a veritable prison, and I am a prisoner!',
        [("precipice", ('hand-picked',)), ("chasm", ('hand-picked',)), ("veritable", ('hand-picked',))],
    ),
    (
        'src-stoker-the-dead-travel-fast',
        'Dracula', 'Bram Stoker', 1897, 345,
        '“Denn die Todten reiten schnell”-- (“For the dead travel fast.”) The strange driver evidently heard the words, for he looked up with a gleaming smile. The passenger turned his face away, at the same time putting out his two fingers and crossing himself. “Give me the Herr’s luggage,” said the driver; and with exceeding alacrity my bags were handed out and put in the calèche. Then I descended from the side of the coach, as the calèche was close alongside, the driver helping me with a hand which caught my arm in a grip of steel; his strength must have been prodigious. Without a word he shook his reins, the horses turned, and we swept into the darkness of the Pass.',
        [("alacrity", ('hand-picked',)), ("prodigious", ('hand-picked',))],
    ),
    (
        'src-doyle-to-sherlock-holmes-she-is-always',
        'The Adventures of Sherlock Holmes', 'Arthur Conan Doyle', 1892, 1661,
        'To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex. It was not that he felt any emotion akin to love for Irene Adler. All emotions, and that one particularly, were abhorrent to his cold, precise but admirably balanced mind. He was, I take it, the most perfect reasoning and observing machine that the world has seen, but as a lover he would have placed himself in a false position. He never spoke of the softer passions, save with a gibe and a sneer. They were admirable things for the observer—excellent for drawing the veil from men’s motives and actions.',
        [("eclipses", ('hand-picked',)), ("abhorrent", ('hand-picked',)), ("gibe", ('hand-picked',))],
    ),
    (
        'src-dickens-best-of-times',
        'A Tale of Two Cities', 'Charles Dickens', 1859, 98,
        'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair, we had everything before us, we had nothing before us, we were all going direct to Heaven, we were all going direct the other way--in short, the period was so far like the present period, that some of its noisiest authorities insisted on its being received, for good or for evil, in the superlative degree of comparison only.',
        [("epoch", ('gloss-overlap', 'hand-picked')), ("incredulity", ('hand-picked',)), ("superlative", ('hand-picked',))],
    ),
    (
        'src-bronte-c-no-possibility-of-taking-a-walk',
        'Jane Eyre', 'Charlotte Brontë', 1847, 1260,
        'There was no possibility of taking a walk that day. We had been wandering, indeed, in the leafless shrubbery an hour in the morning; but since dinner (Mrs. Reed, when there was no company, dined early) the cold winter wind had brought with it clouds so sombre, and a rain so penetrating, that further outdoor exercise was now out of the question. I was glad of it: I never liked long walks, especially on chilly afternoons: dreadful to me was the coming home in the raw twilight, with nipped fingers and toes, and a heart saddened by the chidings of Bessie, the nurse, and humbled by the consciousness of my physical inferiority to Eliza, John, and Georgiana Reed.',
        [("penetrating", ('hand-picked',)), ("chidings", ('hand-picked',))],
    ),
    (
        'src-bronte-c-reader-i-married-him',
        'Jane Eyre', 'Charlotte Brontë', 1847, 1260,
        'Reader, I married him. A quiet wedding we had: he and I, the parson and clerk, were alone present. When we got back from church, I went into the kitchen of the manor-house, where Mary was cooking the dinner and John cleaning the knives, and I said— “Mary, I have been married to Mr. Rochester this morning.” The housekeeper and her husband were both of that decent phlegmatic order of people, to whom one may at any time safely communicate a remarkable piece of news without incurring the danger of having one’s ears pierced by some shrill ejaculation, and subsequently stunned by a torrent of wordy wonderment.',
        [("phlegmatic", ('hand-picked',)), ("ejaculation", ('hand-picked',))],
    ),
    (
        'src-twain-you-dont-know-about-me',
        'Adventures of Huckleberry Finn', 'Mark Twain', 1884, 76,
        "You don't know about me without you have read a book by the name of The Adventures of Tom Sawyer; but that ain't no matter. That book was made by Mr. Mark Twain, and he told the truth, mainly. There was things which he stretched, but mainly he told the truth. That is nothing. I never seen anybody but lied one time or another, without it was Aunt Polly, or the widow, or maybe Mary. Aunt Polly—Tom's Aunt Polly, she is—and Mary, and the Widow Douglas is all told about in that book, which is mostly a true book, with some stretchers, as I said before.",
        [("stretchers", ('hand-picked',))],
    ),
    (
        'src-dickens-little-world-in-which-children',
        'Great Expectations', 'Charles Dickens', 1861, 1400,
        'In the little world in which children have their existence whosoever brings them up, there is nothing so finely perceived and so finely felt as injustice. It may be only small injustice that the child can be exposed to; but the child is small, and its world is small, and its rocking-horse stands as many hands high, according to scale, as a big-boned Irish hunter. Within myself, I had sustained, from my babyhood, a perpetual conflict with injustice. I had known, from the time when I could speak, that my sister, in her capricious and violent coercion, was unjust to me.',
        [("capricious", ('hand-picked',))],
    ),
    (
        'src-bronte-e-i-have-just-returned',
        'Wuthering Heights', 'Emily Brontë', 1847, 768,
        "I have just returned from a visit to my landlord—the solitary neighbour that I shall be troubled with. This is certainly a beautiful country! In all England, I do not believe that I could have fixed on a situation so completely removed from the stir of society. A perfect misanthropist's Heaven—and Mr. Heathcliff and I are such a suitable pair to divide the desolation between us. A capital fellow! He little imagined how my heart warmed towards him when I beheld his black eyes withdraw so suspiciously under their brows, as I rode up, and when his fingers sheltered themselves, with a jealous resolution, still further in his waistcoat, as I announced my name.",
        [("misanthropist", ('hand-picked',))],
    ),
    (
        'src-bronte-e-i-lingered-round-them',
        'Wuthering Heights', 'Emily Brontë', 1847, 768,
        "My walk home was lengthened by a diversion in the direction of the kirk. When beneath its walls, I perceived decay had made progress, even in seven months: many a window showed black gaps deprived of glass; and slates jutted off, here and there, beyond the right line of the roof, to be gradually worked off in coming autumn storms. I sought, and soon discovered, the three headstones on the slope next the moor: the middle one grey, and half buried in heath; Edgar Linton's only harmonized by the turf and moss creeping up its foot; Heathcliff's still bare. I lingered round them, under that benign sky: watched the moths fluttering among the heath and harebells, listened to the soft wind breathing through the grass, and wondered how any one could ever imagine unquiet slumbers for the sleepers in that quiet earth.",
        [("benign", ('hand-picked',)), ("unquiet", ('hand-picked',))],
    ),
    (
        'src-wilde-the-artist-is-the-creator',
        'The Picture of Dorian Gray', 'Oscar Wilde', 1890, 174,
        'The critic is he who can translate into another manner or a new material his impression of beautiful things. The highest as the lowest form of criticism is a mode of autobiography. Those who find ugly meanings in beautiful things are corrupt without being charming. This is a fault. Those who find beautiful meanings in beautiful things are the cultivated. For these there is hope. They are the elect to whom beautiful things mean only beauty. There is no such thing as a moral or an immoral book. Books are well written, or badly written. That is all. The nineteenth century dislike of realism is the rage of Caliban seeing his own face in a glass. The nineteenth century dislike of romanticism is the rage of Caliban not seeing his own face in a glass. The moral life of man forms part of the subject-matter of the artist, but the morality of art consists in the perfect use of an imperfect medium. No artist desires to prove anything. Even things that are true can be proved. No artist has ethical sympathies. An ethical sympathy in an artist is an unpardonable mannerism of style. No artist is ever morbid.',
        [("morbid", ('hand-picked',))],
    ),
    (
        'src-conrad-the-nellie-a-cruising-yawl',
        'Heart of Darkness', 'Joseph Conrad', 1899, 219,
        'The Nellie, a cruising yawl, swung to her anchor without a flutter of the sails, and was at rest. The flood had made, the wind was nearly calm, and being bound down the river, the only thing for it was to come to and wait for the turn of the tide. The sea-reach of the Thames stretched before us like the beginning of an interminable waterway. In the offing the sea and the sky were welded together without a joint, and in the luminous space the tanned sails of the barges drifting up with the tide seemed to stand still in red clusters of canvas sharply peaked, with gleams of varnished sprits. A haze rested on the low shores that ran out to sea in vanishing flatness. The air was dark above Gravesend, and farther back still seemed condensed into a mournful gloom, brooding motionless over the biggest, and the greatest, town on earth.',
        [("interminable", ('hand-picked',)), ("luminous", ('hand-picked',)), ("brooding", ('hand-picked',))],
    ),
    (
        'src-wells-no-one-would-have-believed',
        'The War of the Worlds', 'H. G. Wells', 1898, 36,
        'No one would have believed in the last years of the nineteenth century that this world was being watched keenly and closely by intelligences greater than man’s and yet as mortal as his own; that as men busied themselves about their various concerns they were scrutinised and studied, perhaps almost as narrowly as a man with a microscope might scrutinise the transient creatures that swarm and multiply in a drop of water. With infinite complacency men went to and fro over this globe about their little affairs, serene in their assurance of their empire over matter. It is possible that the infusoria under the microscope do the same. No one gave a thought to the older worlds of space as sources of human danger, or thought of them only to dismiss the idea of life upon them as impossible or improbable. It is curious to recall some of the mental habits of those departed days. At most terrestrial men fancied there might be other men upon Mars',
        [("scrutinised", ('hand-picked',)), ("infusoria", ('hand-picked',)), ("terrestrial", ('hand-picked',))],
    ),
    (
        'src-stevenson-utterson-the-lawyer',
        'Strange Case of Dr Jekyll and Mr Hyde', 'Robert Louis Stevenson', 1886, 43,
        'Mr. Utterson the lawyer was a man of a rugged countenance that was never lighted by a smile; cold, scanty and embarrassed in discourse; backward in sentiment; lean, long, dusty, dreary and yet somehow lovable. At friendly meetings, and when the wine was to his taste, something eminently human beaconed from his eye; something indeed which never found its way into his talk, but which spoke not only in these silent symbols of the after-dinner face, but more often and loudly in the acts of his life. He was austere with himself; drank gin when he was alone, to mortify a taste for vintages; and though he enjoyed the theatre, had not crossed the doors of one for twenty years. But he had an approved tolerance for others; sometimes wondering, almost with envy, at the high pressure of spirits involved in their misdeeds',
        [("austere", ('hand-picked',)), ("mortify", ('hand-picked',))],
    ),
    (
        'src-stevenson-man-is-not-truly-one',
        'Strange Case of Dr Jekyll and Mr Hyde', 'Robert Louis Stevenson', 1886, 43,
        'man is not truly one, but truly two. I say two, because the state of my own knowledge does not pass beyond that point. Others will follow, others will outstrip me on the same lines; and I hazard the guess that man will be ultimately known for a mere polity of multifarious, incongruous and independent denizens. I, for my part, from the nature of my life, advanced infallibly in one direction and in one direction only. It was on the moral side, and in my own person, that I learned to recognise the thorough and primitive duality of man; I saw that, of the two natures that contended in the field of my consciousness, even if I could rightly be said to be either, it was only because I was radically both',
        [("multifarious", ('hand-picked',)), ("denizens", ('hand-picked',)), ("duality", ('gloss-overlap', 'hand-picked'))],
    ),
    (
        'src-stevenson-squire-trelawney',
        'Treasure Island', 'Robert Louis Stevenson', 1883, 120,
        'Squire Trelawney, Dr. Livesey, and the rest of these gentlemen having asked me to write down the whole particulars about Treasure Island, from the beginning to the end, keeping nothing back but the bearings of the island, and that only because there is still treasure not yet lifted, I take up my pen in the year of grace 17—, and go back to the time when my father kept the Admiral Benbow inn and the brown old seaman with the sabre cut first took up his lodging under our roof. I remember him as if it were yesterday, as he came plodding to the inn door, his sea-chest following behind him in a hand-barrow--a tall, strong, heavy, nut-brown man, his tarry pigtail falling over the shoulder of his soiled blue coat, his hands ragged and scarred, with black, broken nails, and the sabre cut across one cheek, a dirty, livid white.',
        [("tarry", ('hand-picked',)), ("livid", ('hand-picked',))],
    ),
    (
        'src-stevenson-joy-of-exploration',
        'Treasure Island', 'Robert Louis Stevenson', 1883, 120,
        'I now felt for the first time the joy of exploration. The isle was uninhabited; my shipmates I had left behind, and nothing lived in front of me but dumb brutes and fowls. I turned hither and thither among the trees. Here and there were flowering plants, unknown to me; here and there I saw snakes, and one raised his head from a ledge of rock and hissed at me with a noise not unlike the spinning of a top. Little did I suppose that he was a deadly enemy and that the noise was the famous rattle. Then I came to a long thicket of these oaklike trees--live, or evergreen, oaks, I heard afterwards they should be called--which grew low along the sand like brambles, the boughs curiously twisted, the foliage compact, like thatch. The thicket stretched down from the top of one of the sandy knolls, spreading and growing taller as it went, until it reached the margin of the broad, reedy fen, through which the nearest of the little rivers soaked its way into the anchorage. The marsh was steaming in the strong sun',
        [("knolls", ('hand-picked',)), ("fen", ('hand-picked',))],
    ),
    (
        'src-twain-tom-no-answer',
        'The Adventures of Tom Sawyer', 'Mark Twain', 1876, 74,
        'TOM!” No answer. “What’s gone with that boy, I wonder? You TOM!” No answer. The old lady pulled her spectacles down and looked over them about the room; then she put them up and looked out under them. She seldom or never looked through them for so small a thing as a boy; they were her state pair, the pride of her heart, and were built for “style,” not service—she could have seen through a pair of stove-lids just as well. She looked perplexed for a moment, and then said, not fiercely, but still loud enough for the furniture to hear: “Well, I lay if I get hold of you I’ll—” She did not finish, for by this time she was bending down and punching under the bed with the broom, and so she needed breath to punctuate the punches with. She resurrected nothing but the cat.',
        [("resurrected", ('hand-picked',))],
    ),
    (
        'src-carroll-alice-was-beginning',
        "Alice's Adventures in Wonderland", 'Lewis Carroll', 1865, 11,
        'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, “and what is the use of a book,” thought Alice “without pictures or conversations?” So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her. There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, “Oh dear! Oh dear! I shall be late!”',
        [("remarkable", ('hand-picked',))],
    ),
    (
        'src-hawthorne-a-throng-of-bearded-men',
        'The Scarlet Letter', 'Nathaniel Hawthorne', 1850, 33,
        'A throng of bearded men, in sad-coloured garments and grey steeple-crowned hats, intermixed with women, some wearing hoods, and others bareheaded, was assembled in front of a wooden edifice, the door of which was heavily timbered with oak, and studded with iron spikes. The founders of a new colony, whatever Utopia of human virtue and happiness they might originally project, have invariably recognised it among their earliest practical necessities to allot a portion of the virgin soil as a cemetery, and another portion as the site of a prison. In accordance with this rule it may safely be assumed that the forefathers of Boston had built the first prison-house somewhere in the vicinity of Cornhill, almost as seasonably as they marked out the first burial-ground, on Isaac Johnson’s lot, and round about his grave, which subsequently became the nucleus of all the congregated sepulchres in the old churchyard of King’s Chapel. Certain it is that, some fifteen or twenty years after the settlement of the town, the wooden jail was already marked with weather-stains and other indications of age, which gave a yet darker aspect to its beetle-browed and gloomy front.',
        [("edifice", ('apposition', 'hand-picked'))],
    ),
    (
        'src-thoreau-i-went-to-the-woods',
        'Walden', 'Henry David Thoreau', 1854, 205,
        'I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived. I did not wish to live what was not life, living is so dear; nor did I wish to practise resignation, unless it was quite necessary. I wanted to live deep and suck out all the marrow of life, to live so sturdily and Spartan-like as to put to rout all that was not life, to cut a broad swath and shave close, to drive life into a corner, and reduce it to its lowest terms, and, if it proved to be mean, why then to get the whole and genuine meanness of it, and publish its meanness to the world; or if it were sublime, to know it by experience, and be able to give a true account of it in my next excursion.',
        [("marrow", ('hand-picked',)), ("sublime", ('hand-picked',))],
    ),
    (
        'src-dubois-between-me-and-the-other-world',
        'The Souls of Black Folk', 'W. E. B. Du Bois', 1903, 408,
        'Between me and the other world there is ever an unasked question: unasked by some through feelings of delicacy; by others through the difficulty of rightly framing it. All, nevertheless, flutter round it. They approach me in a half-hesitant sort of way, eye me curiously or compassionately, and then, instead of saying directly, How does it feel to be a problem? they say, I know an excellent colored man in my town; or, I fought at Mechanicsville; or, Do not these Southern outrages make your blood boil? At these I smile, or am interested, or reduce the boiling to a simmer, as the occasion may require. To the real question, How does it feel to be a problem? I answer seldom a word. And yet, being a problem is a strange experience,—peculiar even for one who has never been anything else, save perhaps in babyhood and in Europe.',
        [("compassionately", ('hand-picked',))],
    ),
    (
        'src-douglass-i-was-born-in-tuckahoe',
        'Narrative of the Life of Frederick Douglass, an American Slave', 'Frederick Douglass', 1845, 23,
        'I was born in Tuckahoe, near Hillsborough, and about twelve miles from Easton, in Talbot county, Maryland. I have no accurate knowledge of my age, never having seen any authentic record containing it. By far the larger part of the slaves know as little of their ages as horses know of theirs, and it is the wish of most masters within my knowledge to keep their slaves thus ignorant. I do not remember to have ever met a slave who could tell of his birthday. They seldom come nearer to it than planting-time, harvest-time, cherry-time, spring-time, or fall-time. A want of information concerning my own was a source of unhappiness to me even during childhood. The white children could tell their ages. I could not tell why I ought to be deprived of the same privilege.',
        [("authentic", ('hand-picked',))],
    ),
    (
        'src-gilman-mere-ordinary-people',
        'The Yellow Wallpaper', 'Charlotte Perkins Gilman', 1892, 1952,
        'It is very seldom that mere ordinary people like John and myself secure ancestral halls for the summer. A colonial mansion, a hereditary estate, I would say a haunted house, and reach the height of romantic felicity—but that would be asking too much of fate! Still I will proudly declare that there is something queer about it. Else, why should it be let so cheaply? And why have stood so long untenanted? John laughs at me, of course, but one expects that in marriage. John is practical in the extreme. He has no patience with faith, an intense horror of superstition, and he scoffs openly at any talk of things not to be felt and seen and put down in figures. John is a physician, and perhaps—(I would not say it to a living soul, of course, but this is dead paper and a great relief to my mind)—perhaps that is one reason I do not get well faster.',
        [("felicity", ('hand-picked',)), ("untenanted", ('hand-picked',))],
    ),
    (
        'src-wharton-i-had-the-story-bit-by-bit',
        'Ethan Frome', 'Edith Wharton', 1911, 4517,
        'I had the story, bit by bit, from various people, and, as generally happens in such cases, each time it was a different story. If you know Starkfield, Massachusetts, you know the post-office. If you know the post-office you must have seen Ethan Frome drive up to it, drop the reins on his hollow-backed bay and drag himself across the brick pavement to the white colonnade; and you must have asked who he was. It was there that, several years ago, I saw him for the first time; and the sight pulled me up sharp. Even then he was the most striking figure in Starkfield, though he was but the ruin of a man. It was not so much his great height that marked him, for the “natives” were easily singled out by their lank longitude from the stockier foreign breed: it was the careless powerful look he had, in spite of a lameness checking each step like the jerk of a chain.',
        [("longitude", ('hand-picked',))],
    ),
    (
        'src-wharton-selden-paused-in-surprise',
        'The House of Mirth', 'Edith Wharton', 1905, 284,
        'Selden paused in surprise. In the afternoon rush of the Grand Central Station his eyes had been refreshed by the sight of Miss Lily Bart. It was a Monday in early September, and he was returning to his work from a hurried dip into the country; but what was Miss Bart doing in town at that season? If she had appeared to be catching a train, he might have inferred that he had come on her in the act of transition between one and another of the country houses which disputed her presence after the close of the Newport season; but her desultory air perplexed him. She stood apart from the crowd, letting it drift by her to the platform or the street, and wearing an air of irresolution which might, as he surmised, be the mask of a very definite purpose.',
        [("desultory", ('hand-picked',)), ("irresolution", ('hand-picked',))],
    ),
    (
        'src-cather-last-summer-i-happened',
        'My Ántonia', 'Willa Cather', 1918, 242,
        'Last summer I happened to be crossing the plains of Iowa in a season of intense heat, and it was my good fortune to have for a traveling companion James Quayle Burden—Jim Burden, as we still call him in the West. He and I are old friends—we grew up together in the same Nebraska town—and we had much to say to each other. While the train flashed through never-ending miles of ripe wheat, by country towns and bright-flowered pastures and oak groves wilting in the sun, we sat in the observation car, where the woodwork was hot to the touch and red dust lay deep over everything. The dust and heat, the burning wind, reminded us of many things. We were talking about what it is like to spend one’s childhood in little towns like these, buried in wheat and corn, under stimulating extremes of climate',
        [("stimulating", ('hand-picked',))],
    ),
    (
        'src-london-buck-did-not-read',
        'The Call of the Wild', 'Jack London', 1903, 215,
        "Buck did not read the newspapers, or he would have known that trouble was brewing, not alone for himself, but for every tide-water dog, strong of muscle and with warm, long hair, from Puget Sound to San Diego. Because men, groping in the Arctic darkness, had found a yellow metal, and because steamship and transportation companies were booming the find, thousands of men were rushing into the Northland. These men wanted dogs, and the dogs they wanted were heavy dogs, with strong muscles by which to toil, and furry coats to protect them from the frost. Buck lived at a big house in the sun-kissed Santa Clara Valley. Judge Miller's place, it was called. It stood back from the road, half hidden among the trees, through which glimpses could be caught of the wide cool veranda that ran around its four sides.",
        [("brewing", ('gloss-overlap', 'hand-picked'))],
    ),
    (
        'src-london-dark-spruce-forest-frowned',
        'White Fang', 'Jack London', 1906, 910,
        'Dark spruce forest frowned on either side the frozen waterway. The trees had been stripped by a recent wind of their white covering of frost, and they seemed to lean towards each other, black and ominous, in the fading light. A vast silence reigned over the land. The land itself was a desolation, lifeless, without movement, so lone and cold that the spirit of it was not even that of sadness. There was a hint in it of laughter, but of a laughter more terrible than any sadness—a laughter that was mirthless as the smile of the sphinx, a laughter cold as the frost and partaking of the grimness of infallibility. It was the masterful and incommunicable wisdom of eternity laughing at the futility of life and the effort of life. It was the Wild, the savage, frozen-hearted Northland Wild.',
        [("ominous", ('hand-picked',)), ("infallibility", ('hand-picked',)), ("futility", ('hand-picked',))],
    ),
    (
        'src-james-the-story-had-held-us',
        'The Turn of the Screw', 'Henry James', 1898, 209,
        'The story had held us, round the fire, sufficiently breathless, but except the obvious remark that it was gruesome, as, on Christmas Eve in an old house, a strange tale should essentially be, I remember no comment uttered till somebody happened to say that it was the only case he had met in which such a visitation had fallen on a child. The case, I may mention, was that of an apparition in just such an old house as had gathered us for the occasion—an appearance, of a dreadful kind, to a little boy sleeping in the room with his mother and waking her up in the terror of it; waking her not to dissipate his dread and soothe him to sleep again, but to encounter also, herself, before she had succeeded in doing so, the same sight that had shaken him.',
        [("apparition", ('hand-picked',)), ("dissipate", ('hand-picked',))],
    ),
    (
        'src-eliot-miss-brooke-had-that-kind-of-beauty',
        'Middlemarch', 'George Eliot', 1871, 145,
        'Miss Brooke had that kind of beauty which seems to be thrown into relief by poor dress. Her hand and wrist were so finely formed that she could wear sleeves not less bare of style than those in which the Blessed Virgin appeared to Italian painters; and her profile as well as her stature and bearing seemed to gain the more dignity from her plain garments, which by the side of provincial fashion gave her the impressiveness of a fine quotation from the Bible,—or from one of our elder poets,—in a paragraph of to-day’s newspaper. She was usually spoken of as being remarkably clever, but with the addition that her sister Celia had more common-sense. Nevertheless, Celia wore scarcely more trimmings; and it was only to close observers that her dress differed from her sister’s, and had a shade of coquetry in its arrangements',
        [("provincial", ('hand-picked',)), ("coquetry", ('hand-picked',))],
    ),
    (
        'src-eliot-a-new-theresa',
        'Middlemarch', 'George Eliot', 1871, 145,
        "A new Theresa will hardly have the opportunity of reforming a conventual life, any more than a new Antigone will spend her heroic piety in daring all for the sake of a brother's burial: the medium in which their ardent deeds took shape is forever gone. But we insignificant people with our daily words and acts are preparing the lives of many Dorotheas, some of which may present a far sadder sacrifice than that of the Dorothea whose story we know. Her finely touched spirit had still its fine issues, though they were not widely visible. Her full nature, like that river of which Cyrus broke the strength, spent itself in channels which had no great name on the earth. But the effect of her being on those around her was incalculably diffusive: for the growing good of the world is partly dependent on unhistoric acts; and that things are not so ill with you and me as they might have been, is half owing to the number who lived faithfully a hidden life, and rest in unvisited tombs.",
        [("diffusive", ('hand-picked',)), ("unhistoric", ('hand-picked',))],
    ),
    (
        'src-eliot-in-the-days-when-the-spinning-wheels',
        'Silas Marner', 'George Eliot', 1861, 550,
        'In the days when the spinning-wheels hummed busily in the farmhouses—and even great ladies, clothed in silk and thread-lace, had their toy spinning-wheels of polished oak—there might be seen in districts far away among the lanes, or deep in the bosom of the hills, certain pallid undersized men, who, by the side of the brawny country-folk, looked like the remnants of a disinherited race. The shepherd’s dog barked fiercely when one of these alien-looking men appeared on the upland, dark against the early winter sunset; for what dog likes a figure bent under a heavy bag?—and these pale men rarely stirred abroad without that mysterious burden. The shepherd himself, though he had good reason to believe that the bag held nothing but flaxen thread, or else the long rolls of strong linen spun from that thread, was not quite sure that this trade of weaving, indispensable though it was, could be carried on entirely without the help of the Evil One.',
        [("pallid", ('hand-picked',)), ("brawny", ('hand-picked',))],
    ),
    (
        'src-thackeray-while-the-present-century',
        'Vanity Fair', 'William Makepeace Thackeray', 1848, 599,
        "While the present century was in its teens, and on one sunshiny morning in June, there drove up to the great iron gate of Miss Pinkerton's academy for young ladies, on Chiswick Mall, a large family coach, with two fat horses in blazing harness, driven by a fat coachman in a three-cornered hat and wig, at the rate of four miles an hour. A black servant, who reposed on the box beside the fat coachman, uncurled his bandy legs as soon as the equipage drew up opposite Miss Pinkerton's shining brass plate, and as he pulled the bell at least a score of young heads were seen peering out of the narrow windows of the stately old brick house.",
        [("equipage", ('hand-picked',))],
    ),
    (
        'src-thackeray-vanitas-vanitatum',
        'Vanity Fair', 'William Makepeace Thackeray', 1848, 599,
        'She is always having stalls at Fancy Fairs for the benefit of these hapless beings. Emmy, her children, and the Colonel, coming to London some time back, found themselves suddenly before her at one of these fairs. She cast down her eyes demurely and smiled as they started away from her; Emmy scurrying off on the arm of George (now grown a dashing young gentleman) and the Colonel seizing up his little Janey, of whom he is fonder than of anything in the world--fonder even than of his History of the Punjaub. "Fonder than he is of me," Emmy thinks with a sigh. But he never said a word to Amelia that was not kind and gentle, or thought of a want of hers that he did not try to gratify. Ah! Vanitas Vanitatum! which of us is happy in this world? Which of us has his desire? or, having it, is satisfied?--come, children, let us shut up the box and the puppets, for our play is played out.',
        [("hapless", ('hand-picked',)), ("demurely", ('hand-picked',))],
    ),
    (
        'src-dickens-whether-i-shall-turn-out',
        'David Copperfield', 'Charles Dickens', 1850, 766,
        'Whether I shall turn out to be the hero of my own life, or whether that station will be held by anybody else, these pages must show. To begin my life with the beginning of my life, I record that I was born (as I have been informed and believe) on a Friday, at twelve o’clock at night. It was remarked that the clock began to strike, and I began to cry, simultaneously. In consideration of the day and hour of my birth, it was declared by the nurse, and by some sage women in the neighbourhood who had taken a lively interest in me several months before there was any possibility of our becoming personally acquainted, first, that I was destined to be unlucky in life; and secondly, that I was privileged to see ghosts and spirits',
        [("destined", ('hand-picked',))],
    ),
    (
        'src-dickens-among-other-public-buildings',
        'Oliver Twist', 'Charles Dickens', 1838, 730,
        'Among other public buildings in a certain town, which for many reasons it will be prudent to refrain from mentioning, and to which I will assign no fictitious name, there is one anciently common to most towns, great or small: to wit, a workhouse; and in this workhouse was born; on a day and date which I need not trouble myself to repeat, inasmuch as it can be of no possible consequence to the reader, in this stage of the business at all events; the item of mortality whose name is prefixed to the head of this chapter. For a long time after it was ushered into this world of sorrow and trouble, by the parish surgeon, it remained a matter of considerable doubt whether the child would survive to bear any name at all; in which case it is somewhat more than probable that these memoirs would never have appeared; or, if they had, that being comprised within a couple of pages, they would have possessed the inestimable merit of being the most concise and faithful specimen of biography, extant in the literature of any age or country.',
        [("prudent", ('hand-picked',)), ("inestimable", ('hand-picked',))],
    ),
    (
        'src-austen-emma-woodhouse',
        'Emma', 'Jane Austen', 1815, 158,
        "Emma Woodhouse, handsome, clever, and rich, with a comfortable home and happy disposition, seemed to unite some of the best blessings of existence; and had lived nearly twenty-one years in the world with very little to distress or vex her. She was the youngest of the two daughters of a most affectionate, indulgent father; and had, in consequence of her sister's marriage, been mistress of his house from a very early period. Her mother had died too long ago for her to have more than an indistinct remembrance of her caresses; and her place had been supplied by an excellent woman as governess, who had fallen little short of a mother in affection. Sixteen years had Miss Taylor been in Mr. Woodhouse's family, less as a governess than a friend, very fond of both daughters, but particularly of Emma.",
        [("indulgent", ('hand-picked',))],
    ),
    (
        'src-austen-sir-walter-elliot',
        'Persuasion', 'Jane Austen', 1817, 105,
        'Sir Walter Elliot, of Kellynch Hall, in Somersetshire, was a man who, for his own amusement, never took up any book but the Baronetage; there he found occupation for an idle hour, and consolation in a distressed one; there his faculties were roused into admiration and respect, by contemplating the limited remnant of the earliest patents; there any unwelcome sensations, arising from domestic affairs changed naturally into pity and contempt as he turned over the almost endless creations of the last century; and there, if every other leaf were powerless, he could read his own history with an interest which never failed. This was the page at which the favourite volume always opened',
        [("consolation", ('hand-picked',))],
    ),
    (
        'src-montgomery-avonlea-main-road',
        'Anne of Green Gables', 'L. M. Montgomery', 1908, 45,
        "the Avonlea main road dipped down into a little hollow, fringed with alders and ladies' eardrops and traversed by a brook that had its source away back in the woods of the old Cuthbert place; it was reputed to be an intricate, headlong brook in its earlier course through those woods, with dark secrets of pool and cascade; but by the time it reached Lynde's Hollow it was a quiet, well-conducted little stream, for not even a brook could run past Mrs. Rachel Lynde's door without due regard for decency and decorum; it probably was conscious that Mrs. Rachel was sitting at her window, keeping a sharp eye on everything that passed, from brooks and children up, and that if she noticed anything odd or out of place she would never rest until she had ferreted out the whys and wherefores thereof.",
        [("decorum", ('hand-picked',)), ("ferreted", ('hand-picked',))],
    ),
    (
        'src-burnett-mary-lennox',
        'The Secret Garden', 'Frances Hodgson Burnett', 1911, 113,
        'When Mary Lennox was sent to Misselthwaite Manor to live with her uncle everybody said she was the most disagreeable-looking child ever seen. It was true, too. She had a little thin face and a little thin body, thin light hair and a sour expression. Her hair was yellow, and her face was yellow because she had been born in India and had always been ill in one way or another. Her father had held a position under the English Government and had always been busy and ill himself, and her mother had been a great beauty who cared only to go to parties and amuse herself with gay people. She had not wanted a little girl at all, and when Mary was born she handed her over to the care of an Ayah, who was made to understand that if she wished to please the Mem Sahib she must keep the child out of sight as much as possible.',
        [("disagreeable", ('hand-picked',))],
    ),
    (
        'src-defoe-i-was-born-in-the-year-1632',
        'Robinson Crusoe', 'Daniel Defoe', 1719, 521,
        'I was born in the year 1632, in the city of York, of a good family, though not of that country, my father being a foreigner of Bremen, who settled first at Hull. He got a good estate by merchandise, and leaving off his trade, lived afterwards at York, from whence he had married my mother, whose relations were named Robinson, a very good family in that country, and from whom I was called Robinson Kreutznaer; but, by the usual corruption of words in England, we are now called—nay, we call ourselves and write our name—Crusoe; and so my companions always called me. I had two elder brothers, one of whom was lieutenant-colonel to an English regiment of foot in Flanders, formerly commanded by the famous Colonel Lockhart, and was killed at the battle near Dunkirk against the Spaniards.',
        [("merchandise", ('hand-picked',))],
    ),
    (
        'src-defoe-i-smiled-to-myself',
        'Robinson Crusoe', 'Daniel Defoe', 1719, 521,
        'I smiled to myself at the sight of this money: “O drug!” said I, aloud, “what art thou good for? Thou art not worth to me—no, not the taking off the ground; one of those knives is worth all this heap; I have no manner of use for thee—e’en remain where thou art, and go to the bottom as a creature whose life is not worth saving.” However, upon second thoughts I took it away; and wrapping all this in a piece of canvas, I began to think of making another raft; but while I was preparing this, I found the sky overcast, and the wind began to rise, and in a quarter of an hour it blew a fresh gale from the shore. It presently occurred to me that it was in vain to pretend to make a raft with the wind offshore',
        [("gale", ('hand-picked',))],
    ),
    (
        'src-swift-my-father-had-a-small-estate',
        "Gulliver's Travels", 'Jonathan Swift', 1726, 829,
        'My father had a small estate in Nottinghamshire; I was the third of five sons. He sent me to Emanuel College in Cambridge at fourteen years old, where I resided three years, and applied myself close to my studies; but the charge of maintaining me, although I had a very scanty allowance, being too great for a narrow fortune, I was bound apprentice to Mr. James Bates, an eminent surgeon in London, with whom I continued four years. My father now and then sending me small sums of money, I laid them out in learning navigation, and other parts of the mathematics, useful to those who intend to travel, as I always believed it would be, some time or other, my fortune to do.',
        [("scanty", ('hand-picked',))],
    ),
    (
        'src-dostoevsky-i-am-a-sick-man',
        'Notes from Underground', 'Fyodor Dostoevsky', 1864, 600,
        'I am a sick man.... I am a spiteful man. I am an unattractive man. I believe my liver is diseased. However, I know nothing at all about my disease, and do not know for certain what ails me. I don’t consult a doctor for it, and never have, though I have a respect for medicine and doctors. Besides, I am extremely superstitious, sufficiently so to respect medicine, anyway (I am well-educated enough not to be superstitious, but I am superstitious). No, I refuse to consult a doctor from spite. That you probably will not understand. Well, I understand it, though. Of course, I can’t explain who it is precisely that I am mortifying in this case by my spite: I am perfectly well aware that I cannot “pay out” the doctors by not consulting them; I know better than anyone that by all this I am only injuring myself and no one else.',
        [("spiteful", ('hand-picked',))],
    ),
    (
        'src-dostoevsky-on-an-exceptionally-hot-evening',
        'Crime and Punishment', 'Fyodor Dostoevsky', 1866, 2554,
        'On an exceptionally hot evening early in July a young man came out of the garret in which he lodged in S. Place and walked slowly, as though in hesitation, towards K. bridge. He had successfully avoided meeting his landlady on the staircase. His garret was under the roof of a high, five-storied house and was more like a cupboard than a room. The landlady who provided him with garret, dinners, and attendance, lived on the floor below, and every time he went out he was obliged to pass her kitchen, the door of which invariably stood open. And each time he passed, the young man had a sick, frightened feeling, which made him scowl and feel ashamed. He was hopelessly in debt to his landlady, and was afraid of meeting her.',
        [("garret", ('hand-picked',))],
    ),
    (
        'src-tolstoy-happy-families',
        'Anna Karenina', 'Leo Tolstoy', 1877, 1399,
        "Happy families are all alike; every unhappy family is unhappy in its own way. Everything was in confusion in the Oblonskys' house. The wife had discovered that the husband was carrying on an intrigue with a French girl, who had been a governess in their family, and she had announced to her husband that she could not go on living in the same house with him. This position of affairs had now lasted three days, and not only the husband and wife themselves, but all the members of their family and household, were painfully conscious of it. Every person in the house felt that there was no sense in their living together, and that the stray people brought together by chance in any inn had more in common with one another than they, the members of the family and household of the Oblonskys.",
        [("intrigue", ('hand-picked',))],
    ),
    (
        'src-verne-the-year-1866',
        'Twenty Thousand Leagues Under the Sea', 'Jules Verne', 1870, 164,
        'The year 1866 was signalised by a remarkable incident, a mysterious and puzzling phenomenon, which doubtless no one has yet forgotten. Not to mention rumours which agitated the maritime population and excited the public mind, even in the interior of continents, seafaring men were particularly excited. Merchants, common sailors, captains of vessels, skippers, both of Europe and America, naval officers of all countries, and the Governments of several states on the two continents, were deeply interested in the matter. For some time past, vessels had been met by “an enormous thing,” a long object, spindle-shaped, occasionally phosphorescent, and infinitely larger and more rapid in its movements than a whale.',
        [("signalised", ('hand-picked',)), ("phosphorescent", ('hand-picked',))],
    ),
    (
        'src-verne-phileas-fogg-lived',
        'Around the World in Eighty Days', 'Jules Verne', 1873, 103,
        'Phileas Fogg lived, in 1872, at No. 7, Saville Row, Burlington Gardens, the house in which Sheridan died in 1814. He was one of the most noticeable members of the Reform Club, though he seemed always to avoid attracting attention; an enigmatical personage, about whom little was known, except that he was a polished man of the world. People said that he resembled Byron—at least that his head was Byronic; but he was a bearded, tranquil Byron, who might live on a thousand years without growing old. Certainly an Englishman, it was more doubtful whether Phileas Fogg was a Londoner. He was never seen on ’Change, nor at the Bank, nor in the counting-rooms of the “City”; no ships ever came into London docks of which he was the owner; he had no public employment',
        [("enigmatical", ('hand-picked',))],
    ),
]


def main() -> None:
    seen_ids = set()
    for sid, work, author, year, gid, text, words in SOURCES:
        assert sid not in seen_ids, f"duplicate id {sid}"
        seen_ids.add(sid)
        wc = len(text.split())
        assert 80 <= wc <= 200, f"{sid} is {wc} words"
        source_name, url = gutenberg(gid)
        assert work in WORK_TOPICS, f"{sid}: {work!r} has no entry in WORK_TOPICS"
        words_out = [{"word": w, "signals": list(signals)} for w, signals in words]
        doc = {
            "id": sid,
            "pool": "sourced",
            "topic": WORK_TOPICS[work],
            "text": text,
            "words": words_out,
            "provenance": {
                "work": work,
                "author": author,
                "year": year,
                "source": source_name,
                "url": url,
                "licence": LICENCE,
                "retrieved": RETRIEVED,
            },
        }
        out_path = HERE / f"{sid}.json"
        out_path.write_text(
            json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
    print(f"wrote {len(SOURCES)} source files")


if __name__ == "__main__":
    main()
