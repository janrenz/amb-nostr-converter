/**
 * SODIX vocabulary → KIM SKOS mappings.
 *
 * Target vocabularies verified against the live SKOS schemes:
 *   HCRT      https://w3id.org/kim/hcrt/scheme.json          (26 concepts)
 *   ISCED     https://w3id.org/kim/isced-1997/scheme.json    (7 levels)
 *   Subjects  https://w3id.org/kim/schulfaecher/index.json   (61 subjects)
 *
 * German labels come from those schemes, not from SODIX. SODIX serves its
 * vocabulary names in mixed languages — `lrts`, `educationLevels`,
 * `schoolTypes`, `costs` and most `hubbs` vocabularies are English, `subjects`
 * and `competences` are German, and `lands` mixes both within one list
 * ("Baden-Württemberg" next to "Bavaria"). Emitting a SODIX name as
 * `prefLabel.de` would therefore be a false language claim in most cases.
 *
 * Every lossy mapping keeps the SODIX original in the `ext` namespace:
 * 48 resource types collapse onto 26 HCRT concepts, 2043 subjects onto 61 KIM
 * subjects. Simplifying is fine; silently dropping data is not.
 */

/** A KIM concept with its authoritative German label. */
export interface KimConcept {
  id: string;
  de: string;
}

/**
 * SODIX learning resource type → HCRT.
 * `other` means "not expressible in HCRT", not "unknown" — the precise SODIX
 * type is always additionally emitted as `ext:<ns>:ressourcentyp`.
 */
export const LEARNING_RESOURCE_TYPES: Readonly<Record<string, KimConcept>> = {
  APP: { id: "https://w3id.org/kim/hcrt/application", de: "Softwareanwendung" },
  ARBEITSBLATT: { id: "https://w3id.org/kim/hcrt/worksheet", de: "Arbeitsmaterial" },
  AUDIO: { id: "https://w3id.org/kim/hcrt/audio", de: "Audio" },
  AUDIOVISUELLES: { id: "https://w3id.org/kim/hcrt/video", de: "Video" },
  BILD: { id: "https://w3id.org/kim/hcrt/image", de: "Abbildung" },
  DATEN: { id: "https://w3id.org/kim/hcrt/data", de: "Daten" },
  ENTDECKENDES: { id: "https://w3id.org/kim/hcrt/other", de: "Sonstiges" },
  EXPERIMENT: { id: "https://w3id.org/kim/hcrt/experiment", de: "Experiment" },
  FALLSTUDIE: { id: "https://w3id.org/kim/hcrt/case_study", de: "Fallstudie" },
  GLOSSAR: { id: "https://w3id.org/kim/hcrt/index", de: "Nachschlagewerk" },
  HANDBUCH: { id: "https://w3id.org/kim/hcrt/text", de: "Textdokument" },
  INTERAKTION: { id: "https://w3id.org/kim/hcrt/other", de: "Sonstiges" },
  KARTE: { id: "https://w3id.org/kim/hcrt/map", de: "Karte" },
  KURS: { id: "https://w3id.org/kim/hcrt/course", de: "Kurs" },
  LERNKONTROLLE: { id: "https://w3id.org/kim/hcrt/assessment", de: "Lernkontrolle" },
  LERNSPIEL: { id: "https://w3id.org/kim/hcrt/educational_game", de: "Lernspiel" },
  MODELL: { id: "https://w3id.org/kim/hcrt/other", de: "Sonstiges" },
  OFFENE: { id: "https://w3id.org/kim/hcrt/other", de: "Sonstiges" },
  PROJECT: { id: "https://w3id.org/kim/hcrt/other", de: "Sonstiges" },
  QUELLE: { id: "https://w3id.org/kim/hcrt/index", de: "Nachschlagewerk" },
  RADIO: { id: "https://w3id.org/kim/hcrt/video", de: "Video" },
  RECHERCHE: { id: "https://w3id.org/kim/hcrt/other", de: "Sonstiges" },
  ROLLENSPIEL: { id: "https://w3id.org/kim/hcrt/other", de: "Sonstiges" },
  SIMULATION: { id: "https://w3id.org/kim/hcrt/simulation", de: "Simulation" },
  SOFTWARE: { id: "https://w3id.org/kim/hcrt/application", de: "Softwareanwendung" },
  SONSTIGES: { id: "https://w3id.org/kim/hcrt/other", de: "Sonstiges" },
  TEST: { id: "https://w3id.org/kim/hcrt/assessment", de: "Lernkontrolle" },
  TEXT: { id: "https://w3id.org/kim/hcrt/text", de: "Textdokument" },
  UBUNG: { id: "https://w3id.org/kim/hcrt/drill_and_practice", de: "Übung" },
  UNTERRICHTSBAUSTEIN: { id: "https://w3id.org/kim/hcrt/lesson_plan", de: "Unterrichtsplanung" },
  UNTERRICHTSPLANUNG: { id: "https://w3id.org/kim/hcrt/lesson_plan", de: "Unterrichtsplanung" },
  VERANSCHAULICHUNG: { id: "https://w3id.org/kim/hcrt/image", de: "Abbildung" },
  VIDEO: { id: "https://w3id.org/kim/hcrt/video", de: "Video" },
  WEBSEITE: { id: "https://w3id.org/kim/hcrt/web_page", de: "Webseite" },
  WEBTOOL: { id: "https://w3id.org/kim/hcrt/application", de: "Softwareanwendung" },
  PRESENTATION: { id: "https://w3id.org/kim/hcrt/slide", de: "Präsentation" },
  BROSCHUERE: { id: "https://w3id.org/kim/hcrt/text", de: "Textdokument" },
  ANLEITUNG: { id: "https://w3id.org/kim/hcrt/text", de: "Textdokument" },
  EBOOK: { id: "https://w3id.org/kim/hcrt/textbook", de: "Lehrbuch" },
  FLYER: { id: "https://w3id.org/kim/hcrt/text", de: "Textdokument" },
  HANDREICHUNG: { id: "https://w3id.org/kim/hcrt/text", de: "Textdokument" },
  INFOGRAFIK: { id: "https://w3id.org/kim/hcrt/diagram", de: "Diagramm" },
  LEHRBUCH: { id: "https://w3id.org/kim/hcrt/textbook", de: "Lehrbuch" },
  MERKBLATT: { id: "https://w3id.org/kim/hcrt/text", de: "Textdokument" },
  MUSIKNOTEN: { id: "https://w3id.org/kim/hcrt/sheet_music", de: "Musiknoten" },
  POSTER: { id: "https://w3id.org/kim/hcrt/image", de: "Abbildung" },
  REZEPT: { id: "https://w3id.org/kim/hcrt/text", de: "Textdokument" },
  VIRTUAL: { id: "https://w3id.org/kim/hcrt/simulation", de: "Simulation" },
};

/** SODIX educational level → ISCED-1997. */
export const EDUCATIONAL_LEVELS: Readonly<Record<string, KimConcept>> = {
  ELEMENTARBEREICH: { id: "https://w3id.org/kim/isced-1997/level0", de: "Elementarbereich" },
  PRIMARBEREICH: { id: "https://w3id.org/kim/isced-1997/level1", de: "Primarbereich" },
  SEKUNDARSTUFE_I: { id: "https://w3id.org/kim/isced-1997/level2", de: "Sekundarbereich I" },
  SEKUNDARSTUFE_II: { id: "https://w3id.org/kim/isced-1997/level3", de: "Sekundarbereich II" },
  FORT_UND_WEITERBILDUNG: { id: "https://w3id.org/kim/isced-1997/level4", de: "Post-sekundarer, nicht-tertiärer Bereich" },
};

/**
 * SODIX top-level subject (level 1, 38 entries) → KIM school subject.
 * Only defensible matches are mapped. SODIX categories without a viable KIM
 * counterpart are deliberately left out and surface as `ext:<ns>:fach`:
 * 140 Elementarbereich/Vorschulerziehung, 180 Freizeit, 280 Grundschule,
 * 300 Heimatraum/Region, 340 Interkulturelle Bildung,
 * 360 Kinder- und Jugendbildung, 500 Praxisorientierte Fächer,
 * 540 Retten/Helfen/Schützen, 580 Spiel- und Dokumentarfilm,
 * 620 Sucht und Prävention, 640 Umweltschutz, 660 Verkehrserziehung,
 * 680 Weiterbildung, 720 Sachgebietsübergreifende Medien.
 */
export const SUBJECTS: Readonly<Record<string, KimConcept>> = {
  "100": { id: "http://w3id.org/kim/schulfaecher/s1002", de: "Chemie" },
  "120": { id: "http://w3id.org/kim/schulfaecher/s1005", de: "Deutsch" },
  "160": { id: "http://w3id.org/kim/schulfaecher/s1008", de: "Ethik" },
  "200": { id: "http://w3id.org/kim/schulfaecher/s1050", de: "Fremdsprachen" },
  "220": { id: "http://w3id.org/kim/schulfaecher/s1010", de: "Geografie" },
  "240": { id: "http://w3id.org/kim/schulfaecher/s1011", de: "Geschichte" },
  "260": { id: "http://w3id.org/kim/schulfaecher/s1012", de: "Gesundheit" },
  "320": { id: "http://w3id.org/kim/schulfaecher/s1013", de: "Informatik" },
  "380": { id: "http://w3id.org/kim/schulfaecher/s1017", de: "Mathematik" },
  "400": { id: "http://w3id.org/kim/schulfaecher/s1046", de: "Medienbildung" },
  "420": { id: "http://w3id.org/kim/schulfaecher/s1020", de: "Musik" },
  "440": { id: "http://w3id.org/kim/schulfaecher/s1045", de: "Erziehungswissenschaften" },
  "450": { id: "http://w3id.org/kim/schulfaecher/s1021", de: "Philosophie" },
  "460": { id: "http://w3id.org/kim/schulfaecher/s1022", de: "Physik" },
  "480": { id: "http://w3id.org/kim/schulfaecher/s1023", de: "Politik" },
  "510": { id: "http://w3id.org/kim/schulfaecher/s1043", de: "Psychologie" },
  "520": { id: "http://w3id.org/kim/schulfaecher/s1055", de: "Religion" },
  "560": { id: "http://w3id.org/kim/schulfaecher/s1029", de: "Sexualerziehung" },
  "600": { id: "http://w3id.org/kim/schulfaecher/s1031", de: "Sport" },
  "700": { id: "http://w3id.org/kim/schulfaecher/s1033", de: "Wirtschaftskunde" },
  "020": { id: "http://w3id.org/kim/schulfaecher/s1048", de: "Arbeitslehre" },
  "040": { id: "http://w3id.org/kim/schulfaecher/s1049", de: "Berufs- und Studienorientierung" },
  "060": { id: "http://w3id.org/kim/schulfaecher/s1015", de: "Kunst" },
  "080": { id: "http://w3id.org/kim/schulfaecher/s1001", de: "Biologie" },
};

/**
 * SODIX language enum → BCP47 / ISO 639.
 * The SODIX list contains three typos (ALBANINAN, CHROATIAN, IRIS) which are
 * deliberately mapped to the correct codes here.
 */
export const LANGUAGES: Readonly<Record<string, string>> = {
  GERMAN: "de",
  ENGLISH: "en",
  FRENCH: "fr",
  SPANISH: "es",
  RUSSIAN: "ru",
  UKRAINIAN: "uk",
  TURKISH: "tr",
  ITALIAN: "it",
  ARABIC: "ar",
  DUTCH: "nl",
  POLISH: "pl",
  SWEDISH: "sv",
  ROMANIAN: "ro",
  PORTUGUESE: "pt",
  PERSIAN: "fa",
  GREEK: "el",
  JAPANESE: "ja",
  CHINESE: "zh",
  NORWEGIAN: "no",
  DANISH: "da",
  CZECH: "cs",
  KOREAN: "ko",
  SLOVENIAN: "sl",
  LATIN: "la",
  TAMIL: "ta",
  URDU: "ur",
  KURDISH: "ku",
  BULGARIAN: "bg",
  LITHUANIAN: "lt",
  HINDI: "hi",
  FINNISH: "fi",
  HUNGARIAN: "hu",
  ROMANI: "rom",
  AFRIKAANS: "af",
  SWAHILI: "sw",
  SERBIAN: "sr",
  VIETNAMESE: "vi",
  HEBREW: "he",
  WOLOF: "wo",
  ESTONIAN: "et",
  THAI: "th",
  MALAY: "ms",
  SLOVAK: "sk",
  CATALAN: "ca",
  AMHARIC: "am",
  ICELANDIC: "is",
  BOSNIAN: "bs",
  LATVIAN: "lv",
  TAGALOG: "tl",
  ARMENIAN: "hy",
  TIBETAN: "bo",
  SOMALI: "so",
  INDONESIAN: "id",
  PASHTO: "ps",
  BENGALI: "bn",
  GEORGIAN: "ka",
  MONGOLIAN: "mn",
  DZONGKHA: "dz",
  MALTESE: "mt",
  RUNDI: "rn",
  MARSHALLESE: "mh",
  ROMANSH: "rm",
  NEPALI: "ne",
  ZULU: "zu",
  ASSAMESE: "as",
  PANJABI: "pa",
  INUKTITUT: "iu",
  CENTRAL_KHMER: "km",
  BASQUE: "eu",
  WELSH: "cy",
  KAZAKH: "kk",
  GALICIAN: "gl",
  QUECHUA: "qu",
  MACEDONIAN: "mk",
  AZERBAIJANI: "az",
  AKAN: "ak",
  TIGRINYA: "ti",
  SORBIAN: "wen",
  SWISS_GERMAN: "gsw",
  ANCIENT_GREEK: "grc",
  SIGN_LANGUAGE: "sgn",
  ALBANINAN: "sq",
  CHROATIAN: "hr",
  IRIS: "ga",
};

/**
 * Values SODIX files under `languages` that do not name a language but a
 * version or accessibility feature. These must not reach `inLanguage`; they
 * surface as `ext:<ns>:sprachfassung`.
 */
export const LANGUAGE_MARKERS: ReadonlySet<string> = new Set([
    "WITHOUT_LANGUAGE",
    "AUDIO_DESCRIPTION",
    "ORIGINAL_VERSION_WITH_SUBTITLES",
    "PLAIN_LANGUAGE",
    "SIMPLE_LANGUAGE",
    "SUBTITLES_FOR_THE_HEARING_IMPAIRED"
  ]);

/**
 * Normalises a Creative Commons URL to its canonical license URI.
 *
 * The distinction matters: `/deed.de` is only the German-language *view* of the
 * same license and is stripped. `/de/` denotes the ported German license — a
 * different license, which is preserved.
 */
export function normalizeLicenseUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let out = String(url).trim();
  if (!/^https?:\/\//i.test(out)) return null;
  out = out.replace(/^http:/i, 'https:');
  out = out.replace(/\/deed\.[a-z_-]+\/?$/i, '/');
  if (!out.endsWith('/')) out += '/';
  return out;
}

/** True for a genuine open license, as opposed to "Copyright, freier Zugang". */
export function isOpenLicense(url: string | null | undefined): boolean {
  const normalized = normalizeLicenseUrl(url);
  return normalized !== null && /creativecommons\.org/i.test(normalized);
}

/**
 * SODIX duration `HH:MM:SS` → ISO 8601 duration `PTnHnMnS`.
 * This is the only format present in the corpus (134301 values checked).
 */
export function durationToIso8601(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(String(value).trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  if (!hours && !minutes && !seconds) return null;
  return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${seconds ? `${seconds}S` : ''}`;
}

/** Normalises the various SODIX timestamp shapes to an ISO 8601 instant. */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}
