"""Authoring source of truth for content/passages/*.json.

Same convention as content/classes/_seed.py: edit this table, re-run it, and
the generated JSON never drifts from a shared format. Four topic clusters,
ten passages each, per the track's starting target
(workspace/tracks/T3-content.md §3) — harbour, wilderness, household, road.

Every `default` below is drawn from its slot's own class members, so the
unfilled render is always a legal fill, not just a plausible-sounding word
picked separately from the class it claims to belong to.

The editorial bar this cannot check by running it — every slot's default
reads invisibly, and the passage still reads as writing with the three most
awkward legal members of each class substituted in — was read against by
hand for each passage below before it was added; see the commit that added
this file.

Run: python content/passages/_seed.py
"""

from __future__ import annotations

import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent

Slot = tuple[int, str, str]  # index, class id, default word


def s(index: int, cls: str, default: str) -> Slot:
    return (index, cls, default)


PASSAGES: list[tuple[str, str, str, list[Slot]]] = [
    # ---------------------------------------------------------------- harbour
    (
        "comp-harbour-dawn",
        "harbour",
        "The {0} light came up over the water, and the boats lay {1} at "
        "their moorings, each one {2} against the pull of the tide. Down on "
        "the quay, an old man in a coat gone {3} with years was already "
        "sorting nets, his hands moving with a patience the morning did "
        "not ask of him. A "
        "gull cried once, and then again, and the sound carried {4} across "
        "the harbour before it was lost among the masts. Further out, past "
        "the breakwater, the sea kept its own hours, indifferent to the "
        "little town waking behind him. He had watched this water for "
        "longer than he cared to say, and still it gave him nothing he "
        "could name — only this, the {5} hour before the boats went out, "
        "when the whole harbour seemed to hold its breath. By the time the "
        "sun cleared the headland, the {6} of the morning would be gone, "
        "replaced by voices and rope and the ordinary business of the day. "
        "For now, though, it was his alone.",
        [
            s(0, "adj.quality.light", "grey"),
            s(1, "adv.manner.still", "quietly"),
            s(2, "adj.state.secure", "steady"),
            s(3, "adj.quality.old", "weathered"),
            s(4, "adv.degree.slightly", "faintly"),
            s(5, "adj.emotion.content", "tranquil"),
            s(6, "noun.abstract.quality.silence", "hush"),
        ],
    ),
    (
        "comp-harbour-storm",
        "harbour",
        "By noon the sky had turned {0}, and the fishermen were already "
        "hauling their gear up from the beach. Old Marden stood at the end "
        "of the pier, watching the swell build with an expression that gave "
        "nothing away. He had seen weather come on {1} before, without the "
        "courtesy of a warning, and he trusted his own reading of it more "
        "than any forecast on the wireless. 'Get the {2} boat in first,' he "
        "called to his son, nodding toward the little skiff that always "
        "rode lowest in rough water. The boy worked {3}, coiling rope with "
        "hands that had done this since before he could properly reach the "
        "cleats. Out past the harbour mouth, the {4} of the coming storm "
        "was unmistakable now, a low grinding hum beneath the wind, growing "
        "steadier by the minute. By the time the last boat was secured, "
        "rain had begun to needle sideways off the sea, and the whole "
        "harbour had gone {5}, waiting for what was coming.",
        [
            s(0, "adj.quality.dark", "sombre"),
            s(1, "adv.time.suddenly", "abruptly"),
            s(2, "adj.quality.old", "weathered"),
            s(3, "adv.manner.grimly", "grimly"),
            s(4, "noun.abstract.sound", "din"),
            s(5, "adj.emotion.wary", "uneasy"),
        ],
    ),
    (
        "comp-harbour-evening-return",
        "harbour",
        "The boats came in {0}, one after another, low in the water with "
        "the day's catch. From the harbour wall, a small crowd had gathered "
        "to watch, the way they always did, though nobody could say exactly "
        "what they were waiting for. A woman in a shawl gone {1} with years "
        "shielded her eyes against the last of the light, searching the "
        "line of hulls for one boat in particular. When she found it, "
        "something in her shoulders let go — the {2} she had been carrying "
        "all afternoon without quite admitting it. The men on deck moved "
        "{3} now that the work was nearly done, calling to each other "
        "across the water in voices roughened by salt and weather. "
        "Somewhere behind the crowd, a rope creaked against a bollard, and "
        "gulls wheeled low over the sterns hoping for scraps. The {4} "
        "evening drew in over the harbour the way it always had, "
        "unremarkable and complete, and one by one the boats found their "
        "places along the wall.",
        [
            s(0, "adv.manner.gracefully", "smoothly"),
            s(1, "adj.quality.old", "faded"),
            s(2, "noun.abstract.emotion.dread", "unease"),
            s(3, "adv.manner.still", "quietly"),
            s(4, "adj.emotion.content", "settled"),
        ],
    ),
    (
        "comp-harbour-fish-market",
        "harbour",
        "By six the market was already {0}, stalls filling with crates that "
        "still smelled of the sea. Buyers moved between the tables at a "
        "{1} pace, testing the firmness of a herring or the clarity of an "
        "eye before they'd part with a coin. A boy from one of the boats "
        "stood guard over a barrow of mackerel, {2} of anyone who lingered "
        "too long without buying. Somewhere near the back, an old woman "
        "haggled over the price of a {3} in a voice that carried over "
        "everything else, undefeated by forty years of the same argument. "
        "The gulls kept up a steady {4} overhead, diving whenever a crate "
        "was tipped or a fish slipped free of careless hands. By eight the "
        "best of the catch was gone, and the market began to {5}, stalls "
        "folding away as quickly as they had opened, until only the smell "
        "of it remained on the cobblestones.",
        [
            s(0, "adj.size.large", "sprawling"),
            s(1, "adj.speed.fast", "brisk"),
            s(2, "adj.emotion.wary", "watchful"),
            s(3, "noun.object.vessel", "trawler"),
            s(4, "noun.abstract.sound", "racket"),
            s(5, "verb.state.change.fade", "dwindle"),
        ],
    ),
    (
        "comp-harbour-lighthouse",
        "harbour",
        "The lighthouse stood at the {0} edge of the point, where the land "
        "gave up and the sea began in earnest. Every evening at the same "
        "hour, the keeper climbed the {1} stairs to light the lamp, a "
        "ritual so old to her now that her hands barely needed her eyes to "
        "guide them. From up there she could {2} the whole coastline, the "
        "scattered lights of the town, the black stretch of water beyond "
        "it, indifferent and enormous. She had taken the position after her "
        "husband died, when the {3} of the empty house had become harder "
        "to bear than the isolation of the rock. Ships passed rarely now, "
        "the trade having moved to bigger ports up the coast, but she kept "
        "the light burning anyway, out of habit as much as duty. On clear "
        "nights she could see weather building far out to sea long before "
        "it reached the coast, and she would stand at the rail and watch "
        "it {4} toward the coast, unhurried, the way everything out here "
        "seemed to move. It was, she had decided, a good enough life.",
        [
            s(0, "adj.quality.dark", "bleak"),
            s(1, "adj.quality.old", "rickety"),
            s(2, "verb.perception.notice", "observe"),
            s(3, "noun.abstract.emotion.dread", "disquiet"),
            s(4, "verb.motion.slow", "drift"),
        ],
    ),
    (
        "comp-harbour-low-tide",
        "harbour",
        "At low tide the harbour gave up a different shape entirely, its "
        "mudflats {0} and exposed where the water had been only hours "
        "before. "
        "Two children picked their way across the {1} stones, hunting for "
        "crabs in the pools left behind by the retreating sea. The younger "
        "one held a jar with the seriousness of a scientist, peering {2} at "
        "every shell and stranded weed as though it might reveal something "
        "important. Her brother, older and less patient, had already given "
        "up twice and come back twice, unable to leave the {3} pools alone "
        "for long. Further along, an old dog picked through the wrack line "
        "at its own pace, {4} nosing at whatever the tide had left. Above "
        "them all, the gulls waited on the harbour wall, watching the mud "
        "for whatever the children missed. By the time the tide turned, "
        "both children were soaked to the knee and entirely unbothered by "
        "it, already planning the next low water.",
        [
            s(0, "adj.size.large", "vast"),
            s(1, "adj.texture.rough", "uneven"),
            s(2, "adv.manner.hesitant", "cautiously"),
            s(3, "adj.size.small", "diminutive"),
            s(4, "adv.manner.still", "quietly"),
        ],
    ),
    (
        "comp-harbour-departure",
        "harbour",
        "The ferry was due out at noon, and by eleven the quay had filled "
        "with the {0} business of leaving — trunks stacked, tickets "
        "checked twice, farewells said and then said again because nobody "
        "wanted to be the one who let go first. Among the crowd stood a "
        "young man with a single case, watching the gangway with an "
        "expression he was trying hard to keep {1}. He had told everyone he "
        "was ready to go, and mostly he believed it, except for the small, "
        "{2} pull he felt every time he looked back at the town behind him. "
        "His mother had said her goodbyes {3} an hour ago and gone home "
        "rather than watch the boat leave, which he understood better than "
        "he let on. When the horn finally sounded, he did not {4} the "
        "faces on the quay for as long as he meant to. The land fell away "
        "quickly after that, and the {5} that had followed him all morning "
        "eased, just slightly, once there was nothing left to leave.",
        [
            s(0, "adj.speed.fast", "brisk"),
            s(1, "adj.emotion.content", "composed"),
            s(2, "adj.emotion.wary", "nervous"),
            s(3, "adv.manner.grimly", "gravely"),
            s(4, "verb.perception.notice", "glimpse"),
            s(5, "noun.abstract.emotion.dread", "unease"),
        ],
    ),
    (
        "comp-harbour-the-wreck",
        "harbour",
        "Nobody in the village talked much about the wreck anymore, though "
        "everyone over fifty could point to the exact spot on the point "
        "where it had gone down. The night itself had turned properly {0}, "
        "the story went, the kind of storm that came once in a working "
        "life, and the {1} "
        "of the wind against the cliffs had kept half the village awake "
        "without anyone knowing why. By morning the {2} was scattered "
        "across the rocks in pieces too small to salvage, and three men who "
        "had gone out that evening did not come home. The {3} of it had "
        "faded with the decades, the way these things do, until it became "
        "a story told to children more as caution than grief. Still, on "
        "certain evenings, when the light went {4} early and the wind "
        "picked up off the point, the older fishermen would grow quiet for "
        "no reason they cared to name, and glance, just once, toward the "
        "rocks.",
        [
            s(0, "adj.quality.dark", "sombre"),
            s(1, "noun.abstract.sound", "clamor"),
            s(2, "noun.object.vessel", "schooner"),
            s(3, "noun.abstract.emotion.dread", "dismay"),
            s(4, "adj.quality.dark", "dim"),
        ],
    ),
    (
        "comp-harbour-winter",
        "harbour",
        "In winter the harbour kept a {0} kind of company — fewer boats, "
        "fewer voices, the whole place drawn in on itself against the "
        "cold. The water itself stayed {1} in colour, never quite lifting "
        "even at noon, and the men who still went out did their work {2}, "
        "hoods up, hardly a word between them. Ice rimmed the edges of the "
        "quay some mornings, thin enough to break underfoot but hard enough "
        "to make the ropes stiff and difficult to coil. The harbourmaster's "
        "office kept its light on later than usual, a small {3} against the "
        "early dark, and the few gulls that stayed through the season "
        "seemed to huddle rather than wheel. Even so, the boats went out, "
        "because the fish did not know it was winter, and by February the "
        "worst of the cold would {4}, the way it always did, leaving the "
        "harbour looking, for a week or two, faintly surprised to still be "
        "standing.",
        [
            s(0, "adj.size.small", "meagre"),
            s(1, "adj.quality.dark", "gloomy"),
            s(2, "adv.manner.still", "silently"),
            s(3, "noun.abstract.emotion.joy", "gladness"),
            s(4, "verb.state.change.fade", "ebb"),
        ],
    ),
    (
        "comp-harbour-night-watch",
        "harbour",
        "Someone had to keep the night watch when the fleet was out late, "
        "and this month it fell to Corran, who did not mind it as much as "
        "he pretended to. He kept his post at the end of the {0} jetty, a "
        "flask of tea going cold beside him, listening for the particular "
        "{1} of engines he'd know anywhere among a hundred others. The town "
        "behind him had gone {2} hours ago, windows dark, the last of the "
        "pub trade gone home. Out on the black water, nothing was visible "
        "but the boats' own lights, small and {3}, moving in a pattern only "
        "the men aboard could read. Corran had done this watch for eleven "
        "years now, and had {4} missed a single one, ever since the season "
        "his father's boat came in three hours over when nobody had been "
        "there to notice. Whatever it cost him in cold nights and lost "
        "sleep, he stayed, watching the dark for lights that were, "
        "eventually, always there.",
        [
            s(0, "adj.quality.old", "weathered"),
            s(1, "noun.abstract.sound", "clatter"),
            s(2, "adj.quality.dark", "dim"),
            s(3, "adj.state.secure", "steady"),
            s(4, "adv.frequency.rarely", "rarely"),
        ],
    ),
    # ------------------------------------------------------------- wilderness
    (
        "comp-wilderness-ridge",
        "wilderness",
        "The climb to the ridge took most of the morning, longer than "
        "either of them had planned for, but the view from the top made "
        "the {0} legs worth it. Below them the {1} spread out in every "
        "direction, unbroken but for a single thread of smoke rising from a "
        "chimney too far off to name. Neither of them spoke for a while, "
        "content to let the wind do what talking needed doing. It was the "
        "kind of quiet that pressed on the ears after a life spent in "
        "town, {2} at first and then, gradually, something closer to "
        "relief. Somewhere below, a hawk rode a thermal in {3} circles, "
        "barely moving its wings, and they watched it until it dropped out "
        "of sight behind an outcrop. They would need to {4} back down "
        "before the light went, but for now neither of them made a move to "
        "leave. The whole valley belonged to them, for as long as they "
        "chose to stay up there and pretend it did.",
        [
            s(0, "adj.speed.slow", "ponderous"),
            s(1, "noun.place.wild", "wilderness"),
            s(2, "adj.emotion.wary", "guarded"),
            s(3, "adj.texture.smooth", "even"),
            s(4, "verb.motion.slow", "trudge"),
        ],
    ),
    (
        "comp-wilderness-cabin",
        "wilderness",
        "The {0} stood exactly where the map said it would, though nothing "
        "about its condition matched the confident line drawn on the page. "
        "One shutter hung by a single hinge, and the porch boards, {1} "
        "from years of weather, gave a complaint under every step, but "
        "the roof, when they checked "
        "it, was sound. They spent the first hour clearing a winter's "
        "worth of leaves and dust, working {2} through rooms that had not "
        "been opened in a season, letting the place breathe. By evening a "
        "fire was going in the old stove, and the cabin had begun, {3}, to "
        "feel less like a ruin and more like a place someone might choose "
        "to be. Outside, the woodland had gone {4} the way it always did "
        "after dark, every sound suddenly enormous against the silence. "
        "Inside, though, with the fire lit and the door latched, it was "
        "easy enough to forget how far they were from anyone at all.",
        [
            s(0, "noun.place.dwelling", "cabin"),
            s(1, "adj.texture.rough", "weathered"),
            s(2, "adv.manner.still", "quietly"),
            s(3, "adv.degree.slightly", "slightly"),
            s(4, "adj.quality.dark", "sombre"),
        ],
    ),
    (
        "comp-wilderness-first-snow",
        "wilderness",
        "The first snow of the season came {0}, overnight, so that the "
        "world outside the window looked entirely rearranged by morning. "
        "The children were out before breakfast, eager to {1} through "
        "drifts that reached their knees, shouting to each other about "
        "nothing in particular except the sheer fact of it. Their "
        "grandfather watched from the porch with a mug going cold in his "
        "hands, remembering {2} how the first snow used to feel before it "
        "meant shovelling and cold engines and a dozen small "
        "inconveniences. The dog, for its part, had no complicated "
        "feelings about any of it and simply ran {3} circles in the yard "
        "until it collapsed, satisfied, in a drift of its own making. By "
        "noon the {4} of the morning had settled into the ordinary "
        "business of winter, but for an hour or two, at least, the whole "
        "yard had belonged to something like wonder.",
        [
            s(0, "adv.time.suddenly", "unexpectedly"),
            s(1, "verb.motion.slow", "trudge"),
            s(2, "adv.degree.slightly", "vaguely"),
            s(3, "adj.speed.fast", "headlong"),
            s(4, "noun.abstract.emotion.joy", "delight"),
        ],
    ),
    (
        "comp-wilderness-moor",
        "wilderness",
        "The path gave out onto open {0} about a mile past the last "
        "farmhouse, and after that there was nothing to guide a walker but "
        "the shape of the land itself. Grouse broke cover {1} underfoot, "
        "startling every time no matter how often it happened, and the "
        "wind never quite stopped, dragging low cloud across the hills in "
        "a procession that felt {2} and endless. Meredith had walked this "
        "stretch a hundred times and still found it easy to lose the path "
        "among the heather, every rise looking much like the last one. She "
        "stayed {3}, watching the sky, since weather out here could "
        "turn in the time it took to eat a sandwich, and today's clouds had "
        "the particular look she had learned not to trust. By the time she "
        "reached the cairn that marked the halfway point, the light had "
        "begun to {4}, and she quickened her pace without quite admitting "
        "to herself why.",
        [
            s(0, "noun.place.wild", "moor"),
            s(1, "adv.time.suddenly", "abruptly"),
            s(2, "adj.speed.slow", "unhurried"),
            s(3, "adj.emotion.wary", "watchful"),
            s(4, "verb.state.change.fade", "fade"),
        ],
    ),
    (
        "comp-wilderness-night-in-the-woods",
        "wilderness",
        "By the time they realized how far they'd walked, the light under "
        "the trees had already gone {0}, and every trunk had started to "
        "look like every other trunk. Nobody said the word lost, not yet, "
        "though the thought sat between them plainly enough. Dovey checked "
        "the compass again, {1} this time, turning it over as if a second "
        "look might change what it said. The woodland at night made sounds "
        "it never made by day, some {2} of small movement in the "
        "undergrowth that was probably nothing, was almost certainly "
        "nothing, and yet. "
        "They agreed, without much discussion, to walk {3} downhill, on the "
        "theory that downhill eventually found water and water eventually "
        "found people. It took another hour, moving {4} between the trees "
        "with a torch that was dimmer than either of them wanted to admit, "
        "before they saw a light that wasn't the moon.",
        [
            s(0, "adj.quality.dark", "murky"),
            s(1, "adv.manner.hesitant", "warily"),
            s(2, "noun.abstract.sound", "rustle"),
            s(3, "adv.manner.still", "quietly"),
            s(4, "adv.manner.hesitant", "cautiously"),
        ],
    ),
    (
        "comp-wilderness-flood",
        "wilderness",
        "The river had been rising for two days before anyone thought to "
        "worry about it, and by the third it had swallowed the {0} where "
        "the cattle usually grazed. Halloran stood at the edge of his land "
        "watching brown water move {1} across ground that had never once, "
        "in his memory, been anything but dry. He'd moved the animals up to "
        "higher pasture the night before, more out of {2} than certainty, "
        "and was glad of it now, watching fence posts disappear one by one "
        "beneath the surface. Neighbours further down the valley had it "
        "worse, their fields turned to a single {3} sheet of water that "
        "reflected the sky like something out of a different, stranger "
        "world. It would take a week for the water to properly recede, and "
        "rather longer than that for the memory of it to {4}, but for now "
        "everyone simply stood at their fences, watching the river do as it "
        "pleased.",
        [
            s(0, "noun.place.wild", "marsh"),
            s(1, "adv.manner.gracefully", "smoothly"),
            s(2, "noun.abstract.emotion.dread", "misgiving"),
            s(3, "adj.texture.smooth", "glassy"),
            s(4, "verb.state.change.fade", "fade"),
        ],
    ),
    (
        "comp-wilderness-drought",
        "wilderness",
        "By August the creek had shrunk to a {0} trickle threading between "
        "stones that hadn't seen open air in years, and the whole valley "
        "had taken on the {1} colour of a summer that refused to end. "
        "Farmers who normally kept to themselves had started meeting at the "
        "feed store just to compare notes, trading rumours about which "
        "wells had gone dry and whose herd was thinning fastest. Old Petrie, "
        "who had farmed this land longer than anyone, watched the sky {2} "
        "each morning for cloud that never quite arrived, the habit worn "
        "into him by seventy summers of doing exactly this. The grass had "
        "gone {3} weeks ago, and now even the hardy scrub along the fence "
        "line was starting to give up, leaves curling in on themselves "
        "against the heat. Everyone kept saying it would break soon, the "
        "way droughts always did eventually, and everyone kept watching a "
        "horizon that {4} offered anything different.",
        [
            s(0, "adj.size.small", "meagre"),
            s(1, "adj.quality.dark", "bleak"),
            s(2, "adv.manner.hesitant", "warily"),
            s(3, "adj.quality.dark", "sombre"),
            s(4, "adv.frequency.rarely", "rarely"),
        ],
    ),
    (
        "comp-wilderness-old-trail",
        "wilderness",
        "Nobody maintained the old trail anymore, not officially, but "
        "enough boots still found it every season to keep the {0} marks "
        "visible under the bracken. It had once connected two villages "
        "that no longer had much reason to speak to each other, back when "
        "walking was simply how a person got anywhere at all. Eleanor "
        "followed it now mostly out of habit, the way she had every autumn "
        "since she was a girl, {1} along a route her own grandmother had "
        "walked before her. In places the path vanished entirely into "
        "{2} scrub, and she found her way more by memory than by any mark "
        "on the ground. Part of the old millrace had collapsed since her "
        "last visit, forcing a {3} detour she hadn't needed to make in "
        "years, and she stood for a moment simply looking at how much the "
        "wood had changed and how little, underneath that, it actually "
        "had. By the time she reached the second village, the light had "
        "begun to {4}, and she was glad, as always, that she still "
        "remembered the way back.",
        [
            s(0, "adj.texture.rough", "uneven"),
            s(1, "adv.manner.still", "quietly"),
            s(2, "adj.size.large", "sprawling"),
            s(3, "adj.size.small", "slight"),
            s(4, "verb.state.change.fade", "dwindle"),
        ],
    ),
    (
        "comp-wilderness-hunters-return",
        "wilderness",
        "Jory came down off the mountain a day later than he'd said he "
        "would, which nobody at the lodge took as cause for alarm since he "
        "always came down a day later than he'd said he would. He looked "
        "{0}, his boots caked to the ankle and his face burned {1} by wind "
        "he hadn't much noticed while it was happening. The others crowded "
        "round with the usual questions, and he answered them {2}, more "
        "interested in the fire than in the story everyone wanted from "
        "him. Truth was, the trip had gone about as well as these things "
        "ever did — no great tale in it, just three days of {3} weather "
        "and one good sighting he didn't feel like sharing yet, in case "
        "saying it aloud somehow spoiled it. He ate more than any one man "
        "reasonably should, said little else, and was asleep in his chair "
        "by nine, boots still on, entirely unbothered by the {4} that had "
        "followed him down every mountain he'd ever climbed.",
        [
            s(0, "adj.speed.slow", "lumbering"),
            s(1, "adj.speed.fast", "quick"),
            s(2, "adv.degree.slightly", "barely"),
            s(3, "adj.quality.cold", "raw"),
            s(4, "noun.abstract.emotion.dread", "wariness"),
        ],
    ),
    (
        "comp-wilderness-spring-thaw",
        "wilderness",
        "The thaw came {0} this year, a week of warm rain that took the "
        "snowpack down almost overnight and left the whole hillside "
        "running with water that had nowhere sanctioned to go. Streams that "
        "had been silent all winter woke up {1}, filling their old channels "
        "and finding a few new ones besides, and the sound of moving water "
        "was, for a few days, everywhere at once. Bardo walked the fence "
        "line each morning checking for washouts, boots sinking into "
        "ground that had gone {2} almost without warning after months of "
        "being frozen solid. The first green showed itself in {3} patches "
        "along the south-facing slopes, easy to miss unless a person knew "
        "exactly where to look, which Bardo, after forty years on this "
        "land, did. By the second week the worst of the melt had begun to "
        "{4}, and the mountain, for a little while longer, belonged to "
        "mud and noise and the particular hope that came with both.",
        [
            s(0, "adv.time.suddenly", "unexpectedly"),
            s(1, "adv.manner.forceful", "fiercely"),
            s(2, "adj.texture.rough", "uneven"),
            s(3, "adj.size.small", "meagre"),
            s(4, "verb.state.change.fade", "subside"),
        ],
    ),
    # -------------------------------------------------------------- household
    (
        "comp-household-kitchen",
        "household",
        "The kitchen was the only room in the house that ever stayed "
        "properly {0}, no matter the season, thanks to a stove that had "
        "not been turned off in living memory. Grandmother ruled it {1}, "
        "moving between counter and stove with a certainty that made the "
        "whole business look easier than it was. She kept a collection of "
        "tins along one shelf, {2} and particular, each one holding "
        "something specific and "
        "unlabeled, a system nobody else in the family had ever managed to "
        "learn. The kettle went on the moment anyone walked through the "
        "door, before a word of greeting was even exchanged, and conversation "
        "happened {3}, in the gaps between chopping and stirring and the "
        "particular attention a good sauce demanded. Outside, whatever the "
        "weather was doing, it stayed {4} on the other side of the glass, "
        "and the kitchen went on being warm and busy and entirely "
        "indifferent to it, the way it always had.",
        [
            s(0, "adj.quality.warm", "temperate"),
            s(1, "adv.manner.forceful", "fiercely"),
            s(2, "adj.size.large", "sprawling"),
            s(3, "adv.manner.still", "quietly"),
            s(4, "adj.quality.cold", "bitter"),
        ],
    ),
    (
        "comp-household-attic",
        "household",
        "Nobody had been up to the attic in years, and it showed the "
        "moment Renata lifted the hatch and let light spill down onto the "
        "landing, {0} and thin. Dust had settled over everything in a "
        "fine, {1} "
        "layer, undisturbed by anything but the occasional bird that found "
        "its way in through the gable vent. She worked through the boxes "
        "{2}, unsure what she was looking for exactly, only that her mother "
        "had said it would be up here somewhere. Old furniture stood "
        "shrouded in sheets, each one a patient {3} waiting to be "
        "introduced, and a trunk in the corner held nothing but "
        "photographs of people nobody in the family could name anymore. "
        "By the time she found the box she wanted, the light through the "
        "gable had begun to {4}, and she carried it down the ladder before "
        "the attic went properly dark around her.",
        [
            s(0, "adj.quality.light", "hazy"),
            s(1, "adj.texture.smooth", "even"),
            s(2, "adv.manner.hesitant", "cautiously"),
            s(3, "noun.person.stranger", "stranger"),
            s(4, "verb.state.change.fade", "fade"),
        ],
    ),
    (
        "comp-household-mending",
        "household",
        "Every Sunday evening without fail, Agnes brought the mending "
        "basket out to the kitchen table and worked through it {0}, a "
        "small mountain of torn hems and missing buttons that never "
        "seemed to shrink no matter how much she managed each week. Her "
        "husband read the paper across from her, offering the {1} comment "
        "whenever a headline seemed to demand one, and neither of them "
        "expected much conversation beyond that. She had learned to sew "
        "from a mother for whom the skill itself was {2}, not decoration, "
        "and her stitches still carried that same no-nonsense economy, "
        "{3} and precise, nothing wasted. The lamp above the table cast a "
        "{4} light over the work, the same light it had cast every Sunday "
        "for as "
        "long as either of them could remember, and by nine the basket was "
        "empty again, ready to slowly refill over the coming week.",
        [
            s(0, "adv.manner.still", "placidly"),
            s(1, "adj.size.small", "meagre"),
            s(2, "adj.quality.old", "venerable"),
            s(3, "adj.texture.smooth", "even"),
            s(4, "adj.quality.warm", "mild"),
        ],
    ),
    (
        "comp-household-visitor",
        "household",
        "A knock at the door came {0}, interrupting supper, unusual enough "
        "at that hour that the whole table went quiet before anyone had "
        "even stood to answer it. On the step stood some {1}, hat in "
        "hand, explaining in a rush that the car had broken down half a "
        "mile up "
        "the road and could he possibly trouble them for a telephone. "
        "Mother, ever {2} of strangers arriving after dark, kept the chain "
        "on a moment longer than strictly necessary before deciding he "
        "looked harmless enough and letting him in. He sat {3} at the edge "
        "of the good chair while the call was made, clearly uncomfortable "
        "at having interrupted a family mid-meal, and declined every offer "
        "of food twice before finally accepting a cup of tea. By the time "
        "his ride arrived, the children had lost all their {4} and were "
        "peppering him with questions about where he'd come from and where "
        "he was going, questions he answered with more patience than the "
        "evening had any right to expect of him.",
        [
            s(0, "adv.time.suddenly", "unexpectedly"),
            s(1, "noun.person.stranger", "stranger"),
            s(2, "adj.emotion.wary", "wary"),
            s(3, "adv.manner.hesitant", "cautiously"),
            s(4, "noun.abstract.emotion.dread", "wariness"),
        ],
    ),
    (
        "comp-household-letter",
        "household",
        "The letter had been sitting unopened on the hall table for three "
        "days before Constance finally worked up the nerve to deal with "
        "it, the {0} handwriting on the envelope enough to tell her exactly "
        "who it was from before she'd even touched it. She carried it to "
        "the kitchen and sat with it {1} for a while, turning it over, "
        "reading nothing but the postmark, putting off the moment a person "
        "can only put off for so long. When she finally opened it, her "
        "hands were {2}, not from cold but from something closer to old "
        "habit, a decade of bracing for whatever this particular "
        "handwriting tended to bring. The letter itself, when she'd read "
        "it twice, turned out to hold no {3} at all — an ordinary update, "
        "a question about the garden, nothing that explained three days of "
        "dread. She laughed once, {4}, at her own theatrics, and put the "
        "kettle on to write back properly, the way she always meant to and "
        "usually did.",
        [
            s(0, "adj.quality.old", "faded"),
            s(1, "adv.manner.still", "quietly"),
            s(2, "adj.emotion.wary", "nervous"),
            s(3, "noun.abstract.emotion.dread", "foreboding"),
            s(4, "adv.manner.grimly", "grimly"),
        ],
    ),
    (
        "comp-household-fire",
        "household",
        "The fire had been laid before anyone woke, the way it always was "
        "in winter, so that the front room was already {0} by the time the "
        "family came down for breakfast. It was Grandad's job, had been "
        "for decades, and he still did it {1}, kneeling at the grate with "
        "the same economy of movement he'd had for as long as anyone could "
        "remember. The wood came from a pile out back, {2} enough that it "
        "never seemed to run low no matter how much of it disappeared "
        "through "
        "the winter, chopped every autumn against a season that always, "
        "somehow, arrived sooner than expected. He fed it {3}, never all "
        "at once, coaxing the flame up through kindling before trusting it "
        "with anything larger. By the time the rest of the house had "
        "properly woken, the {4} of the fire had already made its way "
        "into every room, the true sign, more than any clock, that the day "
        "had begun.",
        [
            s(0, "adj.quality.warm", "mild"),
            s(1, "adv.manner.still", "quietly"),
            s(2, "adj.size.large", "sprawling"),
            s(3, "adv.manner.hesitant", "cautiously"),
            s(4, "noun.abstract.emotion.joy", "gladness"),
        ],
    ),
    (
        "comp-household-moving-day",
        "household",
        "By ten the van was half full and the house had already begun to "
        "look {0}, rooms echoing in a way they never had with furniture "
        "still in them. Priya stood in the empty kitchen for a moment "
        "before the next box, trying to place exactly which corner the "
        "table used to occupy, a detail that seemed suddenly and "
        "uselessly important. The movers worked {1}, wrapping and "
        "carrying with the practiced indifference of people who did this "
        "every week, while the family trailed after them {2}, uncertain "
        "what to do with hands that had nothing left to pack. Her son sat "
        "on the stairs holding a single {3}, refusing to let it go into any "
        "box, insisting he would carry it himself the whole way to the new "
        "house. By early afternoon the rooms had gone properly {4}, "
        "nothing left but marks on the carpet where furniture used to "
        "stand, and Priya took one last walk through before locking the "
        "door on a house that no longer, in any real sense, belonged to "
        "them.",
        [
            s(0, "adj.size.large", "cavernous"),
            s(1, "adv.manner.gracefully", "smoothly"),
            s(2, "adv.manner.hesitant", "uneasily"),
            s(3, "noun.object.tool", "contraption"),
            s(4, "adj.quality.dark", "bleak"),
        ],
    ),
    (
        "comp-household-inheritance",
        "household",
        "The lawyer's letter arrived on a {0} Tuesday, the kind of ordinary "
        "day that made the news inside it feel almost like a joke in poor "
        "taste. Wilhelmina read it twice at the kitchen table, certain "
        "she'd misunderstood, before accepting that her great-aunt had, in "
        "fact, left her the {1} at the edge of town nobody in the family "
        "had visited in a decade. She drove out that weekend feeling {2}, "
        "half sure she was trespassing, even with the deed in her bag, "
        "and let herself in through a door that stuck the way doors do "
        "when nobody has opened them in a while. The rooms held the {3} of "
        "a life she barely remembered, furniture arranged for a person who "
        "was no longer there to use it, and she moved through them {4}, "
        "unwilling yet to touch anything or decide what any of it would "
        "become. It would take months to work out what to do with the "
        "place. For now she simply sat in her great-aunt's kitchen and let "
        "the strangeness of owning it settle in.",
        [
            s(0, "adj.size.small", "modest"),
            s(1, "noun.place.dwelling", "farmhouse"),
            s(2, "adj.emotion.wary", "guarded"),
            s(3, "noun.abstract.time.era", "chapter"),
            s(4, "adv.manner.hesitant", "warily"),
        ],
    ),
    (
        "comp-household-quiet-house",
        "household",
        "The house had gone properly {0} since the last of the children "
        "left, a quiet that Deshi had expected and still, somehow, hadn't "
        "prepared for. Rooms that used to hold constant {1} now held only "
        "the sound of his own footsteps, and he found himself leaving the "
        "radio on more than he used to, simply to have something else "
        "moving through the air. He had taken up small projects {2}, "
        "fixing things around the house that had waited years for his "
        "attention, less because they needed doing and more because his "
        "hands seemed to want a task. In the evenings he sat in a chair by "
        "the window and watched the street go {3}, the neighbourhood "
        "settling into its own version of the same quiet. It was not, he "
        "had decided, an unhappy way to live, only one that had grown "
        "{4}, and he was still learning the difference between the two.",
        [
            s(0, "noun.abstract.quality.silence", "quiet"),
            s(1, "noun.abstract.sound", "racket"),
            s(2, "adv.manner.still", "quietly"),
            s(3, "adj.quality.dark", "dusky"),
            s(4, "adj.emotion.content", "settled"),
        ],
    ),
    (
        "comp-household-workshop",
        "household",
        "The workshop out back was Grandpa's domain absolutely, a {0} "
        "space smelling of sawdust and machine oil that none of the "
        "grandchildren were allowed into without an invitation. He kept "
        "every {1} in its own marked place along the wall, a system that "
        "looked chaotic to anyone else and made perfect sense to him alone. "
        "When he worked, he worked {2}, entirely absorbed, the radio "
        "playing to an audience of exactly one. Occasionally a grandchild "
        "would be granted entry to watch some particular operation, "
        "usually {3} at first, keeping well back from the tools until "
        "curiosity won out over caution. He never explained more than was "
        "asked, believing a person learned more by watching {4} than by "
        "being told, and most of what the grandchildren knew about "
        "patience, they had learned exactly that way, standing quietly at "
        "the edge of his bench.",
        [
            s(0, "adj.size.small", "modest"),
            s(1, "noun.object.tool", "implement"),
            s(2, "adv.manner.still", "silently"),
            s(3, "adv.manner.hesitant", "hesitantly"),
            s(4, "adv.manner.still", "quietly"),
        ],
    ),
    # -------------------------------------------------------------------road
    (
        "comp-road-coach",
        "road",
        "The coach left at first light, {0} loaded with more passengers "
        "than it strictly had room for, everyone arranging elbows and bags "
        "with the {1} patience of people who had done this before and knew "
        "complaint changed nothing. Across from Verity sat some {2}, coat "
        "buttoned wrong in his haste to catch the departure, who spent the "
        "first hour recovering his breath before attempting any "
        "conversation. The road out of town was {3}, rutted from a wet "
        "season, and the coach made slower progress than the timetable "
        "promised, pitching everyone gently against each other at every "
        "hole. Villages passed at long intervals, each one announced by "
        "smoke rising {4} from chimneys before the buildings themselves "
        "came into view. By the time they stopped to change horses, "
        "Verity had learned three strangers' entire life stories and told "
        "very little of her own, which struck her as a fair exchange for a "
        "day spent this way.",
        [
            s(0, "adv.degree.slightly", "barely"),
            s(1, "adj.speed.slow", "unhurried"),
            s(2, "noun.person.stranger", "stranger"),
            s(3, "adj.texture.rough", "rugged"),
            s(4, "adv.manner.still", "quietly"),
        ],
    ),
    (
        "comp-road-inn",
        "road",
        "The inn at the crossroads had stood there longer than anyone "
        "could say for certain, {0} enough to have absorbed a century of "
        "travelers without much changing its character. The "
        "landlord greeted new arrivals {1}, sizing them up in the time it "
        "took to cross the threshold, a skill worn into him by decades of "
        "the same doorway. A fire kept the main room properly {2} against "
        "whatever the road had done to a person's spirits, and the smell "
        "of something roasting promised better things than the weather "
        "had. In the corner, a traveler sat {3}, nursing a single drink "
        "and watching the door more than the fire, the look of someone "
        "waiting "
        "on news that hadn't arrived yet. Talk moved {4} around the room, "
        "picking up news from the last town and passing it to whoever was "
        "headed toward the next one, the whole inn functioning, in its "
        "way, as a kind of exchange nobody had ever formally organized.",
        [
            s(0, "adj.quality.old", "weathered"),
            s(1, "adv.manner.hesitant", "warily"),
            s(2, "adj.quality.warm", "temperate"),
            s(3, "adj.emotion.wary", "anxious"),
            s(4, "adv.manner.still", "quietly"),
        ],
    ),
    (
        "comp-road-crossroads",
        "road",
        "The signpost at the crossroads had lost one arm to weather years "
        "ago, leaving travelers to guess at the {0} road unless they'd "
        "come this way before or thought to ask at the last village. "
        "Osric had come this way many times and still paused there out of "
        "habit, feeling {1} at exactly this spot every time, as though the "
        "choice mattered more than it reasonably should. To "
        "the left the road climbed {2} into hill country he knew well; to "
        "the right it ran flat and fast toward the coast, a route he had "
        "not taken in years for reasons he no longer examined closely. "
        "Some {3} sat at the base of the signpost, resting from whichever "
        "direction he'd come, and offered no opinion when Osric asked "
        "which way led anywhere worth going. In the end Osric went left, "
        "as he nearly always did, and told himself, {4}, that this time "
        "had been a real decision and not simply habit wearing the "
        "costume of one.",
        [
            s(0, "adj.quality.dark", "murky"),
            s(1, "adj.emotion.wary", "guarded"),
            s(2, "adv.manner.forceful", "relentlessly"),
            s(3, "noun.person.stranger", "wayfarer"),
            s(4, "adv.manner.still", "quietly"),
        ],
    ),
    (
        "comp-road-stranger",
        "road",
        "The {0} appeared on the village road just after harvest, walking "
        "with the particular gait of someone who had covered a great "
        "distance and intended to cover a great deal more. Children "
        "trailed him at a {1} distance, curious but unwilling to get too "
        "close, while their parents watched from doorways with the {2} "
        "expression small places reserve for anyone they cannot place. He "
        "asked only for water and directions, offered nothing of his own "
        "story, and moved on {3} before evening, refusing the bed the "
        "miller's wife offered out of something that looked more like "
        "principle than pride. For weeks afterward the village traded "
        "theories about who he'd been and where he was headed, each "
        "version more elaborate than the last, until the {4} of not "
        "knowing became, itself, the most interesting thing about him.",
        [
            s(0, "noun.person.stranger", "wanderer"),
            s(1, "adj.size.small", "modest"),
            s(2, "adj.emotion.wary", "guarded"),
            s(3, "adv.time.suddenly", "abruptly"),
            s(4, "noun.abstract.quality.silence", "quiet"),
        ],
    ),
    (
        "comp-road-long-walk",
        "road",
        "It was a two-day walk to the market town if a person kept a {0} "
        "pace, and Innes had committed to doing it in one, a decision he "
        "was already regretting somewhere around the tenth mile. The road "
        "climbed and dropped {1}, offering no long flat stretch where a "
        "person could simply switch off and let the miles pass unnoticed. "
        "He passed some {2} around noon and considered, briefly, asking "
        "for water, but pride and momentum both argued against stopping "
        "now "
        "that he'd come this far. By late afternoon his legs had gone past "
        "aching into something more like {3} agreement with whatever he "
        "asked of them, a kind of truce between will and body that he "
        "suspected wouldn't last past tomorrow. He reached the market town "
        "just as the last stalls began to {4}, footsore and thoroughly "
        "pleased with himself, already composing the version of this "
        "story he'd tell at the inn.",
        [
            s(0, "adj.speed.fast", "brisk"),
            s(1, "adv.manner.forceful", "relentlessly"),
            s(2, "noun.place.dwelling", "farmhouse"),
            s(3, "adj.emotion.content", "settled"),
            s(4, "verb.state.change.fade", "dwindle"),
        ],
    ),
    (
        "comp-road-market-town",
        "road",
        "The market town sat at the junction of three roads, and on "
        "market day itself the whole place turned properly {0}, carts and "
        "buyers filling every street that led toward the square. Farmers "
        "who normally kept to themselves the rest of the year greeted each "
        "other {1}, the market being one of the few occasions that "
        "reliably brought the whole district together in one place. Prices "
        "were argued over {2}, the way they always were, a ritual both "
        "sides seemed to enjoy more than the actual sums involved. Some "
        "{3} had set up as a fiddler near the well and was doing steady "
        "business in coins tossed his way by people who could clearly "
        "spare it and "
        "some who clearly couldn't. By late afternoon the crowd had begun "
        "to {4}, carts turning homeward loaded with whatever the day's "
        "trading had produced, and the square slowly returned to being "
        "just a square again.",
        [
            s(0, "adj.size.large", "sprawling"),
            s(1, "adv.manner.gracefully", "buoyantly"),
            s(2, "adv.manner.forceful", "fiercely"),
            s(3, "noun.person.stranger", "itinerant"),
            s(4, "verb.state.change.fade", "dwindle"),
        ],
    ),
    (
        "comp-road-pilgrim",
        "road",
        "She had been walking for eleven days by the time the shrine came "
        "into view, and the sight of it, {0} on the hillside, did not "
        "produce the feeling she had expected after so much effort to "
        "reach it. Other pilgrims on the road had spoken of the {1} that "
        "came the moment the destination appeared, some rush of purpose "
        "fulfilled, "
        "but what she felt instead was closer to a {2} kind of emptiness, "
        "the specific letdown of arrival after a journey that had become, "
        "somewhere along the way, more the point than the shrine itself. "
        "She sat on a low wall near the entrance and watched other "
        "travelers approach {3}, faces arranged for the moment they'd "
        "clearly rehearsed, and wondered whether any of them felt what she "
        "was feeling or if the gap between expectation and arrival was "
        "hers alone. Eventually she went in anyway, because eleven days "
        "was eleven days, and a person did not walk that far only to "
        "{4} at the door.",
        [
            s(0, "adj.quality.light", "pale"),
            s(1, "noun.abstract.emotion.joy", "elation"),
            s(2, "adj.size.small", "meagre"),
            s(3, "adv.manner.grimly", "solemnly"),
            s(4, "verb.motion.slow", "dawdle"),
        ],
    ),
    (
        "comp-road-border",
        "road",
        "The border post was little more than a hut and a barrier, manned "
        "by an official who looked at every passport with the same {0} "
        "thoroughness regardless of how simple the case in front of him "
        "actually was. Behind Teodor in the queue, a family argued {1} "
        "about paperwork one of them had apparently forgotten, the "
        "conversation rising and falling in a language he didn't "
        "recognize. The official's office was {2}, a single lamp and a "
        "stack of forms that had clearly not been updated in some time, "
        "and the whole procedure took longer than the actual distance "
        "being crossed seemed to justify. When his turn finally came, "
        "Teodor answered the questions {3}, aware that any hesitation "
        "might invite more of them, and was waved through with a stamp and "
        "no further comment. On the other side of the barrier the road "
        "looked exactly the same as it had a hundred yards back, and yet "
        "something in him registered the crossing as a small, private "
        "{4} regardless.",
        [
            s(0, "adj.emotion.wary", "suspicious"),
            s(1, "adv.manner.forceful", "fiercely"),
            s(2, "adj.size.small", "modest"),
            s(3, "adv.manner.still", "quietly"),
            s(4, "noun.abstract.concept.fate", "reckoning"),
        ],
    ),
    (
        "comp-road-return-journey",
        "road",
        "The road home always felt shorter than the road out, though "
        "Halvard could never decide whether that was a fact about the "
        "world or simply a trick of {0} that played out after every trip. "
        "He'd left three weeks ago feeling {1} enough about the road "
        "ahead, a feeling that had, somewhere around the second week, "
        "quietly given way to an equally strong wish to sleep in his own "
        "bed. The last stretch of "
        "road ran {2} along the river, familiar enough now that he barely "
        "needed to watch it, his mind already several miles ahead at the "
        "house he was returning to. He'd sent word he was coming but "
        "couldn't be sure the letter would {3} him home, and the "
        "uncertainty of it added an odd nervousness to what should have "
        "been simple relief. When the house finally came into view, "
        "smoke rising {4} from the chimney, he found he'd picked up his "
        "pace without quite deciding to, the last half mile going faster "
        "than any of the rest.",
        [
            s(0, "noun.abstract.concept.fate", "circumstance"),
            s(1, "adj.emotion.content", "untroubled"),
            s(2, "adj.speed.slow", "unhurried"),
            s(3, "verb.motion.fast", "race"),
            s(4, "adv.degree.slightly", "faintly"),
        ],
    ),
    (
        "comp-road-last-mile",
        "road",
        "The last mile was always the hardest, a rule Cassius had proven "
        "true on every long walk he'd ever undertaken and this one was no "
        "exception. His pack, {0} at the start of the day, had somehow "
        "grown heavier with every step despite containing exactly what it "
        "had that morning. The road here ran {1} downhill toward the "
        "village, which should have made things easier and somehow didn't, "
        "his legs having settled into a rhythm that resisted any change at "
        "all. A lamp came into view first, {2} against the dark, marking "
        "the edge of town before any of the buildings themselves did, and "
        "he fixed his eyes on it the way a sailor might fix on a "
        "lighthouse. He forced himself to keep his pace {3} rather than "
        "break into the run his "
        "body was suddenly, unreasonably, suggesting, saving what little "
        "dignity remained after a day like this one. When he finally "
        "reached the inn, he lowered himself into the nearest chair with a "
        "groan of pure {4} and did not attempt to move again for a "
        "considerable while.",
        [
            s(0, "adj.size.small", "modest"),
            s(1, "adj.speed.fast", "swift"),
            s(2, "adj.quality.light", "amber"),
            s(3, "adj.speed.slow", "deliberate"),
            s(4, "noun.abstract.emotion.joy", "contentment"),
        ],
    ),
]


def main() -> None:
    seen_ids: set[str] = set()
    placeholder_re = re.compile(r"\{(\d+)\}")
    for pid, topic, text, slots in PASSAGES:
        assert pid not in seen_ids, f"duplicate id {pid}"
        seen_ids.add(pid)
        assert 5 <= len(slots) <= 8, f"{pid} has {len(slots)} slots"

        placeholder_indices = {int(m) for m in placeholder_re.findall(text)}
        slot_indices = {index for index, _cls, _default in slots}
        assert placeholder_indices == slot_indices, (
            f"{pid}: placeholders {sorted(placeholder_indices)} != "
            f"slot indices {sorted(slot_indices)}"
        )

        doc = {
            "id": pid,
            "pool": "composed",
            "topic": topic,
            "text": text,
            "slots": [
                {"index": index, "class": cls, "defaultWord": default}
                for index, cls, default in sorted(slots, key=lambda t: t[0])
            ],
        }
        out_path = HERE / f"{pid}.json"
        out_path.write_text(
            json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
    print(f"wrote {len(PASSAGES)} passage files")


if __name__ == "__main__":
    main()
