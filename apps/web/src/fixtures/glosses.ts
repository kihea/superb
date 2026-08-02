// The prose game's curated glosses: hand-written, plain-language entries
// for the words the composed passages most often steer through (the
// curated opening rotation and the default candidate pool). The word card
// prefers these over the mechanical dictionary cut in
// content/glosses/prose.json -- a raw first-sense Wiktionary gloss can
// land on the wrong reading of a word ("weathered" the verb's past, not
// the noun "weather"), and these were written for the exact sense the
// passages use. The table covers everything beyond this list.
//
// Each entry: a plain definition (gloss-interaction.md -- no genus-species
// formality, no part-of-speech tags), then one sentence using the word in a
// context different from any passage it appears in here.
export interface GlossEntry {
  definition: string;
  elsewhere: string;
}

export const glosses: Record<string, GlossEntry> = {
  grey: { definition: "The colour of ash, or of a sky with no sun in it.", elsewhere: "He had gone grey at the temples before he turned forty." },
  tranquil: { definition: "Calm, undisturbed, without any commotion.", elsewhere: "The lake was tranquil enough to mirror the whole ridge." },
  hush: { definition: "A sudden quiet, especially one that falls over a group of people.", elsewhere: "A hush went through the courtroom as the verdict was read." },
  gravely: { definition: "In a serious, weighty manner, as if something important is at stake.", elsewhere: "The doctor nodded gravely and asked her to sit down." },
  glimpse: { definition: "A brief, partial look at something, gone almost as soon as it arrives.", elsewhere: "From the train she caught a glimpse of the old mill." },
  trawler: { definition: "A fishing boat that drags a large net along the sea floor.", elsewhere: "The trawler came in at dusk, gulls trailing behind it." },
  quietly: { definition: "Without noise or fuss.", elsewhere: "She closed the door quietly so as not to wake him." },
  weathered: { definition: "Worn and marked by long exposure to sun, wind, or rain.", elsewhere: "His weathered hands told you exactly what work he had done." },
  sprawling: { definition: "Spread out untidily over a large area.", elsewhere: "The city had grown into a sprawling mess of suburbs." },
  cautiously: { definition: "In a careful way, watching for danger or mistakes.", elsewhere: "He cautiously tested the ice before putting his weight on it." },
  meagre: { definition: "Small in amount, barely enough.", elsewhere: "Their meagre savings would not last the winter." },
  modest: { definition: "Not large, showy, or drawing attention to itself.", elsewhere: "They lived in a modest flat above the bakery." },
  dwindle: { definition: "To become gradually smaller or less until almost nothing is left.", elsewhere: "Support for the plan began to dwindle after the first vote." },
  sombre: { definition: "Dark, dim, or serious in a way that feels heavy.", elsewhere: "The room fell sombre when the letter was read aloud." },
  guarded: { definition: "Careful about what you reveal; not fully open.", elsewhere: "His answers stayed guarded for the whole interview." },
  warily: { definition: "In a watchful, on-guard way, as if expecting trouble.", elsewhere: "The cat circled the newcomer warily before deciding it was safe." },
  fiercely: { definition: "With great intensity or force.", elsewhere: "She argued fiercely for the plan no one else believed in." },
  brisk: { definition: "Quick and full of energy.", elsewhere: "They kept a brisk pace to beat the rain home." },
  smoothly: { definition: "Without interruption, roughness, or difficulty.", elsewhere: "The handover went smoothly, with barely a question asked." },
  settled: { definition: "Calm and fixed in place, no longer moving or unsettled.", elsewhere: "By spring the dust of the move had finally settled." },
  bleak: { definition: "Bare, cold, and without any comfort or cheer.", elsewhere: "The forecast for the harvest looked increasingly bleak." },
  uneven: { definition: "Not level or consistent; rough or irregular.", elsewhere: "The old floorboards were uneven underfoot." },
  abruptly: { definition: "Suddenly, without warning, and often in a way that feels rude or unfinished.", elsewhere: "The meeting ended abruptly when the fire alarm went off." },
  stranger: { definition: "Someone you do not know.", elsewhere: "A stranger asked him for directions to the station." },
  fade: { definition: "To lose colour, brightness, or strength gradually.", elsewhere: "The photograph had begun to fade in the sunlight." },
  unexpectedly: { definition: "In a way that was not predicted or planned for.", elsewhere: "Her uncle turned up unexpectedly at the wedding." },
  unhurried: { definition: "Slow and easy, with no sense of rush.", elsewhere: "They took an unhurried walk along the shore." },
  steady: { definition: "Firm, stable, not shaking or changing.", elsewhere: "He kept a steady hand while threading the needle." },
  faintly: { definition: "Weakly, barely noticeable.", elsewhere: "The music was faintly audible from the next room." },
  nervous: { definition: "Uneasy or anxious, especially before something uncertain.", elsewhere: "She was nervous before every flight, no matter how many times she had done it." },
  unease: { definition: "A vague feeling that something is wrong.", elsewhere: "A quiet unease settled over the office after the announcement." },
  faded: { definition: "Lost in colour or strength over time.", elsewhere: "His enthusiasm for the project had faded by the third month." },
  watchful: { definition: "Paying close attention, alert to what might happen.", elsewhere: "The shepherd kept a watchful eye on the darkening sky." },
  racket: { definition: "A loud, confused noise.", elsewhere: "The kids made such a racket the neighbours complained." },
  dim: { definition: "Not bright; giving off only a little light.", elsewhere: "The bulb in the hallway had gone dim." },
  rarely: { definition: "Not often; only once in a while.", elsewhere: "He rarely spoke unless he had something worth saying." },
  grimly: { definition: "In a way that shows determination despite difficulty, or grim humour about it.", elsewhere: "She smiled grimly and picked up the shovel again." },
  silently: { definition: "Without making any sound.", elsewhere: "He silently agreed, though he did not say a word." },
  gladness: { definition: "A feeling of happiness or pleasure.", elsewhere: "News of her recovery was met with real gladness." },
  mild: { definition: "Gentle in effect; not strong or extreme.", elsewhere: "It had been a mild winter, with barely any frost." },
  farmhouse: { definition: "A house that is or was part of a farm.", elsewhere: "They rented an old farmhouse for the summer." },
  temperate: { definition: "Moderate, not extreme, especially in weather.", elsewhere: "The coast has a temperate climate all year round." },
  quiet: { definition: "Making little or no noise; calm.", elsewhere: "The library stayed quiet on weekday mornings." },
  wariness: { definition: "A cautious watchfulness, expecting possible trouble.", elsewhere: "His wariness around strangers eased only after months." },
  barely: { definition: "Only just; almost not at all.", elsewhere: "She barely made the last train." },
  murky: { definition: "Dark, unclear, or hard to see through.", elsewhere: "The pond water was too murky to see the bottom." },
  relentlessly: { definition: "Without stopping or easing up.", elsewhere: "The rain fell relentlessly for three days straight." },
  trudge: { definition: "To walk slowly and heavily, especially when tired.", elsewhere: "They trudged home through the snow, boots soaked through." },

  invalids: { definition: "People weakened by illness or injury.", elsewhere: "The old sanatorium once housed dozens of invalids." },
  indulgent: { definition: "Generous to the point of giving someone whatever they want.", elsewhere: "Her indulgent grandmother let her stay up as late as she liked." },
  consolation: { definition: "Comfort given after a loss or disappointment.", elsewhere: "It was small consolation that the rain finally stopped before the walk home." },
  fixed: { definition: "Set firmly in place; not changing.", elsewhere: "His opinion on the matter was fixed long before the debate began." },
  disagreeable: { definition: "Unpleasant; not to a person's liking.", elsewhere: "The smell from the factory was disagreeable in the summer heat." },
  remarkable: { definition: "Worth noticing because it is unusual or impressive.", elsewhere: "It was a remarkable recovery, given how ill she had been." },
  stimulating: { definition: "Exciting the mind; interesting in a way that provokes thought.", elsewhere: "It had been years since a conversation felt this stimulating." },
  persistence: { definition: "The quality of continuing to try despite difficulty.", elsewhere: "It took years of persistence before the business turned a profit." },
  wretched: { definition: "Miserable, in a very unhappy or unfortunate state.", elsewhere: "The refugees arrived in a wretched condition after the crossing." },
  gale: { definition: "A very strong wind.", elsewhere: "A gale tore the tarpaulin clean off the roof." },
  merchandise: { definition: "Goods bought and sold.", elsewhere: "The stall sold merchandise brought in from three different ports." },
  explicit: { definition: "Stated clearly and in detail, leaving nothing to guess at.", elsewhere: "The instructions were explicit about which wire to cut first." },
  capricious: { definition: "Changing mood or behaviour suddenly and without a clear reason.", elsewhere: "The weather up there is capricious enough to ruin a picnic in minutes." },
  destined: { definition: "Certain to happen, as if fate had already decided it.", elsewhere: "He always felt destined for something bigger than the family shop." },
  spiteful: { definition: "Deliberately unkind, meant to hurt or annoy.", elsewhere: "The review was more spiteful than honest." },
  garret: { definition: "A small, often shabby room at the top of a house, under the roof.", elsewhere: "The painter rented a cold garret for almost nothing." },
  authentic: { definition: "Genuine; really what it claims to be.", elsewhere: "The museum verified the letter was authentic before displaying it." },
  compassionately: { definition: "With sympathy for someone else's suffering.", elsewhere: "She spoke compassionately to the family waiting outside." },
  edifice: { definition: "A large, imposing building.", elsewhere: "The old bank stood as a stone edifice on the corner." },
  brewing: { definition: "Starting to develop or gather, often used of trouble or storms.", elsewhere: "You could tell from the silence that an argument was brewing." },
  decorum: { definition: "Polite, socially correct behaviour.", elsewhere: "The judge expected strict decorum in the courtroom." },
  ferreted: { definition: "Searched persistently until something hidden was found.", elsewhere: "She ferreted the old photographs out from the back of the drawer." },
  tarry: { definition: "To stay somewhere longer than planned; to delay leaving.", elsewhere: "He tarried at the gate, reluctant to say goodbye." },
  livid: { definition: "Extremely angry, or a bruised bluish colour.", elsewhere: "Her father was livid when he saw the dent in the car." },
  austere: { definition: "Plain and severe, without comfort or decoration.", elsewhere: "The monastery's austere rooms held nothing but a bed and a chair." },
  mortify: { definition: "To cause someone deep embarrassment or shame.", elsewhere: "The mistake would mortify him for years afterward." },
  scanty: { definition: "Very small in amount; barely enough.", elsewhere: "The scanty rainfall that year left the wells half empty." },
  wrench: { definition: "A sudden, painful twist, or a sharp pull.", elsewhere: "Leaving the old house was a wrench none of them expected." },
  intrigue: { definition: "Secret plotting or scheming, or the fascination that comes with a mystery.", elsewhere: "Palace intrigue kept the court gossiping for months." },
  resurrected: { definition: "Brought back after being dead, forgotten, or abandoned.", elsewhere: "The old family recipe was resurrected for the reunion." },
  longitude: { definition: "A measurement of position east or west on the earth's surface.", elsewhere: "Sailors once struggled for centuries to measure longitude at sea." },
  morbid: { definition: "Unusually interested in death, illness, or unpleasant things.", elsewhere: "He had a morbid fascination with shipwreck stories." },
  desultory: { definition: "Moving from one thing to another without any real plan or purpose.", elsewhere: "Their desultory conversation trailed off before either of them noticed." },
  alacrity: { definition: "Eager readiness or willingness to do something.", elsewhere: "She accepted the challenge with surprising alacrity." },
  prodigious: { definition: "Impressively large or great.", elsewhere: "He had a prodigious memory for names and dates." },
  epoch: { definition: "A distinct period of time, especially one marked by particular events.", elsewhere: "Historians still argue over when that epoch really ended." },
  incredulity: { definition: "Disbelief; an unwillingness to accept something as true.", elsewhere: "He met the news with open incredulity." },
  superlative: { definition: "Of the highest possible quality or degree.", elsewhere: "The chef's reputation for superlative desserts drew crowds from out of town." },
  penetrating: { definition: "Sharp and probing, able to get to the heart of something.", elsewhere: "She had a penetrating gaze that made excuses feel pointless." },
  chidings: { definition: "Mild scoldings; words of disapproval.", elsewhere: "He bore his mother's chidings without a word of complaint." },
  benign: { definition: "Gentle and kindly; not harmful.", elsewhere: "The old dog gave visitors a benign, sleepy welcome." },
  unquiet: { definition: "Restless, troubled, unable to settle.", elsewhere: "An unquiet feeling kept her from sleeping that night." },
  apparition: { definition: "A ghostly figure, or something that appears suddenly and strangely.", elsewhere: "For a moment the fog took the shape of an apparition." },
  dissipate: { definition: "To scatter and disappear gradually.", elsewhere: "The crowd's anger slowly dissipated once the doors opened." },
  hapless: { definition: "Unlucky, especially in a way that invites pity.", elsewhere: "The hapless intern had to explain the error to the whole board." },
};

/** The curated entry for a word, or undefined -- the caller decides what a
 *  miss falls back to (the dictionary table, then honest words). */
export function glossFor(word: string): GlossEntry | undefined {
  return glosses[word.toLowerCase()];
}
