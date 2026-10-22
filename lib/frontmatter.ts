/**
 * Finding where a book actually begins.
 *
 * Real editions open with pages nobody wants to translate: a title page, the
 * transcriber's credits, a copyright notice, a table of contents, a
 * dedication, a prologue. The language detector in ./language only catches
 * apparatus written in *English*, so a Spanish edition's Spanish front matter
 * goes straight through. This finds the first real chapter instead.
 *
 * The bias throughout is against cutting: over-trimming silently eats the
 * opening of the book, which is far worse than leaving a prologue in.
 */

export type Chapter = { title: string; index: number };

export type BodyStart = { index: number; startedAt?: string };

const FRONT_MATTER_HEADING =
  /^(=?\s*)(réamhrá|brollach|clár|innéacs|buíochas|aguisín|foclóirín|nóta an aistritheora|pr[óo]logo|prologo|prefacio|pre[áa]mbulo|introducci[óo]n|dedicatoria|tasa|fe de erratas|testimonio de las erratas|erratas|privilegio|aprobaci[óo]n|[íi]ndice|indice|contenido|sumario|tabla de|agradecimientos|advertencia|al lector|notas? (preliminar|del|de la|de los)|notas del transcriptor|portada|cr[ée]ditos|copyright|colof[óo]n|ap[ée]ndice|bibliograf[íi]a|glosario|vocabulario|abreviaturas|contents|table of contents|preface|foreword|introduction|dedication|acknowledgements?|index|glossary|appendix|bibliography|errata|title page|avant-propos|pr[ée]face|vorwort|einleitung|prefazione|introduzione|litteraturförteckning|literaturverzeichnis|innehållsförteckning|köszönetnyilvánítás|indholdsfortegnelse|inhaltsverzeichnis|wörterverzeichnis|innehållsregister|sisällysluettelo|transkriberarens|viiteselitykset|tartalomjegyzék|ordförklaringar|transskribantoj|berichtigungen|aanteekeningen|verantwoording|ringraziamenti|agradecimentos|öfversättarens|transskribinto|avertissement|remerciements|bibliographie|johdatukseksi|transkription|inhoudsopgave|aantekeningen|verbeteringen|dankbetuiging|rolverdeeling|presentazione|abbreviazioni|bibliographia|översättarens|förkortningar|indholdsliste|ordforklaring|oversætterens|avant-propos|introduction|vorbemerkung|woordenlijst|aanteekening|bibliografie|rolverdeling|introduzione|avvertimento|trascrittore|frontespizio|bibliografia|apresentação|introduktion|namnregister|anmärkningar|upplysningar|adnotationes|annotationes|vocabularium|antauxparolo|bibliografio|erarkorektoj|dankesprimoj|anmærkninger|forkortelser|afskriverens|forfatterens|bemærkninger|vocabulaire|approbation|suomentajan|verzeichnis|anmerkungen|abkürzungen|druckfehler|voorbericht|aantekening|titelpagina|opmerkingen|vocabolario|postfazione|introducção|advertência|advertencia|dedicatória|dedicatoria|vocabulário|vocabulario|tárgymutató|hibajegyzék|förteckning|sakregister|efterskrift|introductio|antaŭparolo|antauparolo|enhavtabelo|introducció|introduccio|dedicatòria|advertiment|presentació|presentacio|personatges|personatjes|repartiment|preliminars|fortegnelse|taksigelser|saatteeksi|selityksiä|loppusanat|jälkisanat|loppulause|geleitwort|einleitung|einführung|danksagung|titelblatt|toewijding|bladwijzer|glossarium|drukfouten|aanhangsel|prefazione|avvertenza|tipografia|introdução|szójegyzék|sajtóhibák|dedikation|noteringar|personerna|argumentum|corrigenda|conspectus|antaŭvorto|postparolo|ilustraĵoj|aclariment|agraïments|agraiments|indledning|tilegnelse|udgiverens|personerne|préambule|glossaire|appendice|privilège|alkulause|alkusanat|lukijalle|hakemisto|kiitokset|oikaisuja|nimilehti|zueignung|impressum|voorwoord|inleiding|voetnoten|naschrift|slotwoord|nabericht|titelblad|dankwoord|contenuto|occhiello|copertina|glossario|proprietà|glossário|bevezetés|névmutató|jegyzetek|javítások|inledning|tillägnan|rättelser|praefatio|prooemium|dedicatio|antaŭnoto|enkonduko|vortareto|titolpaĝo|contingut|rettelser|prologue|dédicace|sommaire|postface|épilogue|argument|colophon|sisällys|johdanto|henkilöt|register|nachwort|personen|voorrede|voorspel|opdracht|premessa|sommario|colofone|prefácio|prefacio|conteúdo|conteudo|apêndice|apendice|posfácio|bevezető|előjáték|prológus|tartalom|függelék|toldalék|irodalom|innehåll|ordlista|tryckfel|appendix|efterord|personer|rollerna|proemium|prologus|elenchus|klarigoj|rimarkoj|apendico|kolofono|ordliste|préface|lexique|sisältö|esipuhe|esisana|omistus|jäsenet|sanasto|prologi|epilogi|vorwort|vorrede|widmung|glossar|quellen|proloog|nawoord|epiloog|colofon|bijlage|prologo|proemio|licenza|prólogo|proêmio|sumário|sumario|erratas|colofão|előhang|ajánlás|jegyzet|företal|förspel|monitum|lectori|prefaco|dedicxo|indekso|epilogo|glosaro|vortaro|prefaci|prolech|endreça|apèndix|apendix|portada|fortale|indhold|notice|errata|annexe|prolog|inhalt|anhang|inhoud|dedica|indice|índice|előszó|elöszó|mutató|utószó|zárszó|címlap|szótár|förord|omslag|bilaga|bihang|källor|epilog|dediĉo|enhavo|averto|aldono|pròleg|proleg|sumari|proemi|epíleg|epileg|colofó|forord|indeks|tillæg|table|index|liite|noten|aviso|notas|noter|notae|notoj|índex|taula|notes|bilag|motto|nota|note|tack|noto|avís)\b/i;

const ORDINALS: Record<string, number> = {
  "céad": 1,
  "chéad": 1,
  "aon": 1,
  "dara": 2,
  "dó": 2,
  "tríú": 3,
  "trí": 3,
  "ceathrú": 4,
  "cúigiú": 5,
  "een": 1,
  "één": 1,
  "eerste": 1,
  "egy": 1,
  "eins": 1,
  "elsö": 1,
  "első": 1,
  "ensi": 1,
  "ensimäinen": 1,
  "ensimmäinen": 1,
  "erste": 1,
  "ersten": 1,
  "erster": 1,
  "erstes": 1,
  "ett": 1,
  "första": 1,
  "første": 1,
  "premier": 1,
  "première": 1,
  "prima": 1,
  "primeira": 1,
  "primeiro": 1,
  "primer": 1,
  "primera": 1,
  "primo": 1,
  "primum": 1,
  "primus": 1,
  "um": 1,
  "uma": 1,
  "un": 1,
  "una": 1,
  "une": 1,
  "únic": 1,
  "unica": 1,
  "únich": 1,
  "unico": 1,
  "uno": 1,
  "unu": 1,
  "unua": 1,
  "yksi": 1,
  "alter": 2,
  "altera": 2,
  "anden": 2,
  "andet": 2,
  "andra": 2,
  "deux": 2,
  "deuxième": 2,
  "dois": 2,
  "dos": 2,
  "du": 2,
  "dua": 2,
  "duas": 2,
  "due": 2,
  "dues": 2,
  "kaksi": 2,
  "két": 2,
  "kettő": 2,
  "második": 2,
  "second": 2,
  "seconda": 2,
  "seconde": 2,
  "secondo": 2,
  "secunda": 2,
  "secundum": 2,
  "secundus": 2,
  "segon": 2,
  "segona": 2,
  "segunda": 2,
  "segundo": 2,
  "toinen": 2,
  "två": 2,
  "twee": 2,
  "tweede": 2,
  "zwei": 2,
  "zweite": 2,
  "zweiten": 2,
  "zweiter": 2,
  "zweites": 2,
  "derde": 3,
  "drei": 3,
  "drie": 3,
  "dritte": 3,
  "dritten": 3,
  "dritter": 3,
  "drittes": 3,
  "harmadik": 3,
  "három": 3,
  "kolmas": 3,
  "kolme": 3,
  "terceira": 3,
  "terceiro": 3,
  "tercer": 3,
  "tercera": 3,
  "tertia": 3,
  "tertium": 3,
  "tertius": 3,
  "terza": 3,
  "terzo": 3,
  "tre": 3,
  "tredie": 3,
  "tredje": 3,
  "tres": 3,
  "três": 3,
  "tri": 3,
  "tria": 3,
  "trois": 3,
  "troisième": 3,
  "fjärde": 4,
  "fjerde": 4,
  "fyra": 4,
  "kvar": 4,
  "kvara": 4,
  "négy": 4,
  "negyedik": 4,
  "neljä": 4,
  "neljäs": 4,
  "quart": 4,
  "quarta": 4,
  "quarto": 4,
  "quartum": 4,
  "quartus": 4,
  "quatre": 4,
  "quatrième": 4,
  "quatro": 4,
  "quattro": 4,
  "vier": 4,
  "vierde": 4,
  "vierte": 4,
  "vierten": 4,
  "vierter": 4,
  "viertes": 4,
  "cinc": 5,
  "cinch": 5,
  "cinco": 5,
  "cinq": 5,
  "cinque": 5,
  "cinquè": 5,
  "cinquena": 5,
  "cinquième": 5,
  "fem": 5,
  "femte": 5,
  "fünf": 5,
  "fünfte": 5,
  "fünften": 5,
  "fünfter": 5,
  "fünftes": 5,
  "kvin": 5,
  "kvina": 5,
  "öt": 5,
  "ötödik": 5,
  "quinta": 5,
  "quinto": 5,
  "quintum": 5,
  "quintus": 5,
  "viides": 5,
  "viisi": 5,
  "vijf": 5,
  "vijfde": 5,
};

function romanValue(text: string): number | null {
  if (!/^[IVXLCDM]+$/i.test(text)) return null;
  const digits: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const chars = text.toLowerCase().split("");
  let total = 0;
  for (let i = 0; i < chars.length; i++) {
    const value = digits[chars[i]];
    const next = digits[chars[i + 1]];
    total += next && value < next ? -value : value;
  }
  return total;
}

/**
 * Which chapter number a heading claims, if any. Used only to notice that a
 * candidate is chapter *two* — which means chapter one was missed, and the
 * whole detection should be distrusted rather than used to cut it away.
 */
export function headingNumber(title: string): number | null {
  const cleaned = title.trim().replace(/[.:—–-]+$/, "");

  const bare = cleaned.match(/^(\d{1,3}|[IVXLCDM]{1,7})$/i)?.[1];
  if (bare) return /^\d+$/.test(bare) ? Number(bare) : romanValue(bare);

  const after = cleaned.match(
    /^=?\s*(?:caibidil|leabhar|cuid|mír|eachtra|cap[íi]tulo|capitulo|chapter|kapitel|chapitre|capitolo|libro|tomo|volumen|acto|escena|jornada|canto|cuadro|parte|commentarius|conclusione|hauptstück|aflevering|intermezzo|abschnitt|abenteuer|hoofdstuk|afdeeling|paragraaf|avdelning|afdelning|capitulum|chapitre|kuvaelma|kertomus|auftritt|kapittel|capittel|afdeling|capitolo|giornata|capítulo|capitulo|felvonás|kapitlet|epistula|epistola|cxapitro|chapitro|section|tableau|journée|épisode|kohtaus|kapitel|bedrijf|tooneel|sezione|novella|lezione|epilogo|jornada|fejezet|szakasz|jelenet|avsnitt|volumen|ĉapitro|capítol|capitol|partie|volume|lettre|näytös|aufzug|gesang|toneel|quadro|epocha|scenen|sången|häftet|sectio|scaena|carmen|fabula|volumo|sekcio|llibre|escena|quadre|secció|seccio|afsnit|optrin|livre|scène|chant|kirja|laulu|jakso|vihko|theil|stück|szene|scene|brief|canto|parte|libro|scena|livro|época|könyv|kötet|boken|delen|akten|tablå|volym|häfte|caput|liber|actus|parto|sceno|kanto|volum|série|sèrie|tome|acte|luku|runo|nide|buch|teil|band|boek|deel|zang|capo|tomo|atto|acto|cena|rész|szín|ének|scen|sång|pars|akto|part|cant|bind|sang|osa|akt|ato|kép|kap|bok|tom|bog)\s+(\S+)/i,
  )?.[1];
  if (!after) return null;

  const word = after.toLowerCase().replace(/[.,:;]+$/, "");
  if (ORDINALS[word] != null) return ORDINALS[word];
  if (/^\d+$/.test(word)) return Number(word);
  return romanValue(word);
}

/** Credits, copyright pages, dedications, and tables of contents. */
export function looksLikeApparatus(passage: string): boolean {
  if (
    /project gutenberg|produced by|transcriber|proofread|e-?text prepared|this e-?book is for the use|distributed proofreading/i.test(
      passage,
    )
  ) {
    return true;
  }
  // The same notes, written in the language of the edition rather than English.
  if (
    /transcripci[óo]n|transcriptor|digitalizaci[óo]n|versi[óo]n de texto|texto sin formatear|est[áa] (indicado|representado|encerrado) (con|por|entre)|entre guiones bajos|(en|con) (letra )?cursiva|entre signos de igual/i.test(
      passage,
    )
  ) {
    return true;
  }
  // The same furniture in the other languages on the shelf: rights notices,
  // translator and illustrator credits, series and edition lines. These head
  // most European editions and are what a reader hits before the first page.
  if (
    /tous droits r[ée]serv|diritti di riproduzione|diritti riservati|alle rechten voorbehouden|alle rechte vorbehalten|todos os direitos|tots els drets|alla r[äa]ttigheter|minden jog fenntartva|kaikki oikeudet|alle rettigheder/i.test(
      passage,
    )
  ) {
    return true;
  }
  if (
    /\b(?:suomentanut|suomennos|traduit (?:par|de)|traduction de|[üu]bersetzt von|[üu]bertragen von|vertaald door|tradotto da|traduzione di|traducido por|tradu[çc][ãa]o de|oversat af|[öo]versatt av|ford[íi]totta|elbesz[ée]l[ií]|kuvittanut|illustrations?\s+(?:de|par)|illustriert von|met\s+(?:\d+\s+)?(?:tekeningen|illustraties)|teckningar av|tegninger af)\b/i.test(
      passage,
    )
  ) {
    return true;
  }

  // Title pages and dedications shout: mostly capitals, and short.
  const letters = passage.replace(/[^\p{L}]/gu, "");
  if (letters.length > 12 && passage.length < 500) {
    const capitals = passage.replace(/[^\p{Lu}]/gu, "").length;
    if (capitals / letters.length > 0.5) return true;
  }
  if (
    /^\s*(copyright|©|\(c\)\s|derechos reservados|todos los derechos|isbn|dep[óo]sito legal|printed in|impreso en|primera edici[óo]n|edici[óo]n digital|all rights reserved)/i.test(
      passage,
    )
  ) {
    return true;
  }

  // A contents page: most lines ending in a page number, or dot leaders.
  const lines = passage.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length >= 3) {
    const listy = lines.filter(
      (line) => /\d{1,4}\s*$/.test(line.trim()) || /\.{3,}\s*\d/.test(line),
    ).length;
    if (listy >= Math.ceil(lines.length * 0.6)) return true;
  }

  // The same thing after the line breaks are lost: titles and page numbers
  // run together, so look at how heavily numbered the prose is instead.
  if (/\b_?p[áa]gs?\._?\b/i.test(passage)) return true;
  const words = passage.split(/\s+/).filter(Boolean);
  const numbers = words.filter((word) => /^\d{1,4}[.,]?$/.test(word)).length;
  if (numbers >= 4 && words.length < 150 && numbers / words.length > 0.07) return true;

  return false;
}

/** Is there real prose here, rather than more apparatus or a contents list? */
function proseFollows(passages: string[], chapters: Chapter[], from: number): boolean {
  const following = passages.slice(from, from + 5);
  if (following.length < 3) return false;

  const averageLength = following.reduce((sum, p) => sum + p.length, 0) / following.length;
  if (averageLength < 120) return false;
  if (following.some(looksLikeApparatus)) return false;

  // Headings packed close together are a table of contents, not the book.
  const crowded = chapters.filter((c) => c.index >= from && c.index < from + 4).length;
  return crowded < 3;
}

/**
 * The body of a book announces itself as a *series* of numbered headings —
 * I, II, III or Capítulo primero, Capítulo II. Front matter never does. Keying
 * off the series rather than off any single heading is what keeps a prologue
 * from passing as chapter one.
 */
export function findBodyStart(passages: string[], chapters: Chapter[]): BodyStart | null {
  if (passages.length < 20) return null;

  // Front matter is never half the book; refuse to cut further than this.
  const limit = Math.max(1, Math.floor(passages.length * 0.35));

  const numbered = chapters
    .map((chapter, at) => ({ ...chapter, at, number: headingNumber(chapter.title) }))
    .filter((chapter) => chapter.number != null);

  const accept = (index: number, title?: string): BodyStart | null =>
    index > 0 && index <= limit && proseFollows(passages, chapters, index)
      ? { index, startedAt: title }
      : null;

  // 1. A heading numbered one, confirmed by a two not far behind it.
  for (let i = 0; i < numbered.length; i++) {
    const chapter = numbered[i];
    if (chapter.index > limit) break;
    if (chapter.number !== 1) continue;
    if (FRONT_MATTER_HEADING.test(chapter.title.trim())) continue;
    if (!numbered.slice(i + 1, i + 4).some((c) => c.number === 2)) continue;

    // Already at chapter one: there is nothing in front to cut.
    if (chapter.index === 0) return null;
    const found = accept(chapter.index, chapter.title.trim());
    if (found) return found;
  }

  // 2. A series that starts at two means chapter one carries some other title
  //    — the book's name, usually — and is the heading just before it.
  for (let i = 0; i < numbered.length; i++) {
    const chapter = numbered[i];
    if (chapter.index > limit) break;
    if (chapter.number !== 2) continue;
    if (!numbered.slice(i + 1, i + 3).some((c) => c.number === 3)) continue;

    const previous = chapters[chapter.at - 1];
    if (previous && !FRONT_MATTER_HEADING.test(previous.title.trim())) {
      if (previous.index === 0) return null;
      const found = accept(previous.index, previous.title.trim());
      if (found) return found;
    }
    break;
  }

  // 3. Nothing numbered at all: begin after the last front-matter section.
  let lastFront = -1;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].index > limit) break;
    if (FRONT_MATTER_HEADING.test(chapters[i].title.trim())) lastFront = i;
  }
  // Walk forward past anything that turns out to be a contents list rather
  // than the book, instead of trusting the very next heading.
  for (let i = lastFront + 1; lastFront >= 0 && i < chapters.length; i++) {
    if (chapters[i].index > limit) break;
    const found = accept(chapters[i].index, chapters[i].title.trim());
    if (found) return found;
  }

  // 4. Last resort: drop a leading run of credits.
  let last = -1;
  let gap = 0;
  for (let i = 0; i < limit; i++) {
    if (looksLikeApparatus(passages[i])) {
      last = i;
      gap = 0;
    } else if (++gap > 3) {
      break;
    }
  }

  return last >= 0 && last + 1 < passages.length ? { index: last + 1 } : null;
}
