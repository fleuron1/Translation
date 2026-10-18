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
  es: new Set(
    "de la que el en y a los se del las un por con no una su para es al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos esto antes algunos qué unos yo otro otras otra él tanto esa estos mucho nada muchos cual poco ella estar había era son fue ser tiene dijo"
      .split(" "),
  ),
  fr: new Set(
    "le de un à être et en avoir que pour dans ce il qui ne sur se pas plus par je avec tout faire son mettre autre on mais nous comme mon lui nos sans aussi celui donc des les la du au elle ils était est sont été cette ces quelque bien où ou si dont leur vous moi"
      .split(" "),
  ),
  de: new Set(
    "der die das und in zu den von mit sich des auf für ist im dem nicht ein eine als auch es an werden aus er hat dass sie nach wird bei einer um am sind noch wie einem über so zum war haben nur oder aber vor zur bis mehr durch man sein wenn ihr dann ich wir mich"
      .split(" "),
  ),
  it: new Set(
    "di che e il la a per un in non una mi è sono le si lo ma ha ti ci come più da se io hai ho questo qui del alla tutto anche al della gli nel con su mio li era quando cosa dei sua suo tu lei noi loro essere fare perché"
      .split(" "),
  ),
  pt: new Set(
    "de a o que e do da em um para com não uma os no se na por mais as dos como mas ao ele das à seu sua ou quando muito nos já eu também só pelo pela até isso ela entre era depois sem mesmo aos seus quem nas me esse eles está foi são tem"
      .split(" "),
  ),
  nl: new Set(
    "de van het een en in is dat op te zijn met voor niet aan er die ook als maar om door over bij uit nog naar dan of wat heeft werd deze hij zij ze hun was wordt veel heb ik je we men geen zich tot onder tegen waar"
      .split(" "),
  ),
  la: new Set(
    "et in est non ad cum ut qui quae quod sed ex de per si enim autem nec sunt atque ab hoc esse eius iam quam tamen etiam esset erat hunc haec illa res rem omnes omnia nam quoque ita neque me te se tibi mihi"
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

  const best = runs.sort((a, b) => b.count - a.count)[0];
  if (!best) return null;
  if (best.count < 15 || best.count < passages.length * 0.15) return null;
  if (best.start === 0 && best.end === passages.length - 1) return null;
  return { start: best.start, end: best.end };
}
