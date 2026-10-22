/**
 * A crude function-word detector, used for one job: Gutenberg files are
 * wrapped in English apparatus — title pages, an editor's introduction,
 * endnotes, a glossary — and none of that is the book you came to read.
 * Scoring each passage lets the loader find where the actual text begins.
 */

const ENGLISH = new Set(
  "the of and to in a is that it for was with as his on be at by this had not are but from or have an they which one you were her all she there would their we him been has when who will more if out so said what up its about into than them can only other some could time these two may then do first any my now such like our over even most made after also did many before must through back where much your way well down should because each just those how too little very make world still own see work long get here between both life being under never day same another know while last might us great old year off come since against go came right used take three"
    .split(" "),
);

const BY_LANG: Record<string, Set<string>> = {
  fr: new Set(
      "le la les un une des du de au aux ce cette ces mon ma mes son sa ses notre votre leur" +
      "et ou mais car donc que qui dont où quand comme si ne pas plus ni à dans en par pour" +
      "sur sous sans avec chez entre après avant je tu il elle on nous vous ils elles me te" +
      "se lui y moi est sont était été être a ont avait avoir fut"
      .split(" "),
  ),
  fi: new Set(
      "ja on ei oli se hän että kuin mutta niin kun nyt minä sen hänen vaan he joka sitä mitä" +
      "sitten vielä sinä jo häntä kaikki siitä jos sillä ne en ole siinä siellä silloin eikä" +
      "aina kuinka olivat ollut olisi tämä heidän mitään taas koska tässä täällä niinkuin" +
      "juuri minun vaikka kyllä ettei minua hänelle olla tuo siihen olen me mikä kanssa ennen" +
      "jonka näin kuitenkin niitä sinua ovat itse tämän myös vai jotka tai sekä sinun te et"
      .split(" "),
  ),
  de: new Set(
      "der die und in den von zu das mit sich des auf für ist im dem nicht ein eine als auch" +
      "es an werden aus er hat dass sie nach wird bei einer um am sind noch wie einem über so" +
      "zum war haben nur oder aber vor zur bis durch man sein wenn ihr dann ich wir mich ihm" +
      "mir du ihn uns ihre einen kann hatte waren schon was wo wurde diese habe denn unter" +
      "ohne weil ob"
      .split(" "),
  ),
  nl: new Set(
      "en de het een zij hij van in dat ik niet haar je te was zijn op met den maar die er" +
      "hem zich had als zoo aan is nu voor toen ze naar dan wat om zou uit nog bij ook door" +
      "of over toch wel daar al meer u me eens geen hoe mij tot zal mijn waar waren ben werd" +
      "kon hare hebben dien kan der onder heeft hun toe tegen eene want men dit moet deze"
      .split(" "),
  ),
  it: new Set(
      "e di che a il la non un in per si le una con ma i da più gli del come era se della è" +
      "lo al mi alla io o quel quella suo quando anche sua ne ci nel loro perchè perché tutti" +
      "tutto sono questo delle dei chi lui senza ed vi ad me nella questa ho ha uno dalla" +
      "ogni fosse quale dal fu quello mio col tu voi nè né cui lei erano noi ti egli"
      .split(" "),
  ),
  pt: new Set(
      "que de a o e não se um uma do da dos das os as em no na nos ao aos à á com para por" +
      "pelo pela me lhe te eu tu ele ela elle ella elles mas como mais ou nem quando porque" +
      "já depois sem ainda tão só também tambem assim este esta esse essa isso isto aquela" +
      "aquella meu minha seu sua seus muito quem onde até entre é era foi ser tem tinha está" +
      "havia"
      .split(" "),
  ),
  hu: new Set(
      "a az és hogy nem is egy volt s de meg csak már én ha azt van még most ki mint ő ez" +
      "mert el hát e volna itt se pedig mi mikor ott neki úgy sem be mit akkor ne te ezt" +
      "hanem kell aztán minden valami majd vagy lesz maga fel aki lett mind magát vagyok ugy" +
      "így igy vissza voltak nekem rá alatt oda le vele után mellett előtt vannak legyen ami" +
      "között ide nincs kellett lehet"
      .split(" "),
  ),
  sv: new Set(
      "och i att det som en på är av af för med den till har de inte icke ej om ett han men" +
      "var jag sig från vi så kan man när hon också efter eller nu under vid över ska skulle" +
      "bara hur mot upp ut in du alla där mycket ha hade hafva blev vara kunde honom henne" +
      "hans sin sitt mig dem vad hvad här då än utan genom någon något ingen äro voro ock uti" +
      "hvar"
      .split(" "),
  ),
  la: new Set(
      "et in est non ad ut cum quod qui a me de se sed quae esse atque quam ex erat autem" +
      "mihi quid si quo eum ac enim e nec te ego per tamen hoc sunt nos ab etiam id vero ipse" +
      "ille eo ita aut sibi tum esset ubi ea quibus eius nihil haec nobis sic tu quia vel eam" +
      "tibi jam quidem nisi nunc pro sit inter ne itaque hic iam erant qua illi ejus quum" +
      "sine his"
      .split(" "),
  ),
  eo: new Set(
      "la l' kaj de mi al li en ne ke ŝi estas vi estis por sed kun kiu sur ili per tiu el" +
      "kiel pri pli mia da ni ĝi ĉi tio ĉu kiam tiel min lin sia tre unu sin oni lia ĝin se" +
      "nur jam ĉar sian post ĉe kiuj antaŭ nun pro ŝia aŭ dum tie plej ŝin vin ĉiuj kiun ol" +
      "via kion do tion tiun ankoraŭ ilin tiuj ankaŭ tamen je eĉ ĝis si esti"
      .split(" "),
  ),
  ca: new Set(
      "de i la que a el un en no una les per els amb del se al més com hi es però era li va" +
      "és si ho dels jo em seu seva ell ja ha o us me ella fins això aquell on pas sense" +
      "sobre què ni son lo aquest aquesta aquella entre perquè cap als pel qui han són havia" +
      "havien haver vaig ens sa sota dins quan tu et te meu meva l' d' s' n'"
      .split(" "),
  ),
  da: new Set(
      "og han i det at var en saa så de til jeg paa på der den med ikke af er hun for sig som" +
      "et havde om ham men mig da nu du ved har ud blev fra op over vi hans dem deres kunde" +
      "kunne efter kan vilde ville jo skal sin sit hende hendes skulde skulle hvor alle være" +
      "været min hvad naar når dig vil noget selv ogsaa også man maa må kun eller dog her" +
      "ingen"
      .split(" "),
  ),
};

export type Verdict = "target" | "english" | "unclear";

function ratios(text: string, lang: string) {
  const target = BY_LANG[lang];
  const words = text.toLowerCase().match(/[\p{L}\p{M}']+/gu) ?? [];
  if (words.length < 6 || !target) return null;

  let targetHits = 0;
  let englishHits = 0;
  for (const word of words) {
    if (target.has(word)) targetHits++;
    if (ENGLISH.has(word)) englishHits++;
  }
  return { target: targetHits / words.length, english: englishHits / words.length };
}

/**
 * Measured on real Gutenberg editions, the two groups separate by an order of
 * magnitude: Spanish prose scores ~0.46 target / ~0.02 English, while an
 * editor's note scores ~0.05 / ~0.57. These thresholds sit in that gap.
 */
export function classify(text: string, lang: string): Verdict {
  if (lang === "en") return "target";
  const r = ratios(text, lang);
  if (!r) return "unclear";
  if (r.target >= 0.18 && r.target > r.english * 2) return "target";
  if (r.english >= 0.15 && r.english > r.target * 2) return "english";
  return "unclear";
}

/**
 * Finds the span that is actually the book: the longest stretch of
 * target-language passages, tolerating a few interruptions. Short or
 * ambiguous passages neither extend a stretch nor break it, and the span
 * always begins and ends on a passage that is confidently in the language —
 * otherwise a trailing glossary creeps back in.
 *
 * Returns null when nothing should be cut.
 */
export function findBookSpan(
  passages: string[],
  lang: string,
  maxGap = 3,
): { start: number; end: number } | null {
  if (lang === "en" || !BY_LANG[lang] || passages.length < 20) return null;

  const verdicts = passages.map((p) => classify(p, lang));
  const runs: { start: number; end: number; count: number }[] = [];

  let start = -1;
  let lastTarget = -1;
  let gap = 0;
  let count = 0;

  for (let i = 0; i < passages.length; i++) {
    if (verdicts[i] === "target") {
      if (start === -1) start = i;
      lastTarget = i;
      gap = 0;
      count++;
    } else if (verdicts[i] === "english" && start !== -1 && ++gap > maxGap) {
      runs.push({ start, end: lastTarget, count });
      start = -1;
      gap = 0;
      count = 0;
    }
  }
  if (start !== -1) runs.push({ start, end: lastTarget, count });

  // An annotated edition drops blocks of English footnotes into the middle of
  // the text, splitting one body into several runs. Rejoin neighbours when the
  // English between them is small next to the runs it separates — otherwise
  // the longest-run rule keeps only the stretch after the last footnote.
  const merged: { start: number; end: number; count: number }[] = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (previous) {
      let englishBetween = 0;
      for (let i = previous.end + 1; i < run.start; i++) {
        if (verdicts[i] === "english") englishBetween++;
      }
      if (englishBetween <= Math.max(maxGap, 0.2 * Math.min(previous.count, run.count))) {
        previous.end = run.end;
        previous.count += run.count;
        continue;
      }
    }
    merged.push({ ...run });
  }

  const best = merged.sort((a, b) => b.count - a.count)[0];
  if (!best) return null;
  if (best.count < 15 || best.count < passages.length * 0.15) return null;
  if (best.start === 0 && best.end === passages.length - 1) return null;
  return { start: best.start, end: best.end };
}
