/**
 * Speaker Canonicalization — shared between narrator-engine and identity.
 *
 * Lives in its own module to avoid a circular import
 * (narrator-engine ↔ identity).
 */

/** A canonical list of well-known Odyssey speakers, used to canonicalize
 *  parsed speaker names (so "Athena", "she said", "the goddess said" all
 *  resolve to the same narrator id when context allows). */
const KNOWN_SPEAKERS: Record<string, string> = {
  zeus: "Zeus",
  athena: "Athena",
  poseidon: "Poseidon",
  hermes: "Hermes",
  apollo: "Apollo",
  odysseus: "Odysseus",
  telemachus: "Telemachus",
  penelope: "Penelope",
  nestor: "Nestor",
  menelaus: "Menelaus",
  helen: "Helen",
  agamemnon: "Agamemnon",
  calypso: "Calypso",
  circe: "Circe",
  nausicaa: "Nausicaa",
  alcinous: "Alcinous",
  arete: "Arete",
  eumaeus: "Eumaeus",
  eurycleia: "Eurycleia",
  eurylochus: "Eurylochus",
  eurymachus: "Eurymachus",
  antinous: "Antinous",
  polyphemus: "Polyphemus",
  cyclops: "Polyphemus",
  teiresias: "Teiresias",
  elpenor: "Elpenor",
  anticleia: "Anticleia",
  agelaus: "Agelaus",
  amphinomus: "Amphinomus",
  leocritus: "Leocritus",
  leodes: "Leodes",
  phemius: "Phemius",
  medon: "Medon",
  mentor: "Mentor",
  mentes: "Mentes",
  halitherses: "Halitherses",
  aegyptius: "Aegyptius",
  eurynome: "Eurynome",
  iphthime: "Iphthime",
  melanthius: "Melanthius",
  melantho: "Melantho",
  theoclymenus: "Theoclymenus",
  piraeus: "Piraeus",
  noemon: "Noemon",
  peisistratus: "Peisistratus",
  pisistratus: "Peisistratus",
  ctesippus: "Ctesippus",
  polybus: "Polybus",
  autonoe: "Autonoe",
  dolius: "Dolius",
  laertes: "Laertes",
};

/** Pronouns / articles / common verbs that should never be treated as
 *  speaker names (they slip through the regex when dialogue is attributed
 *  via "said he" or "the king said"). */
const NON_NAME_WORDS = new Set([
  "he", "she", "they", "we", "i", "you", "it",
  "his", "her", "their", "its", "our", "your", "my",
  "him", "them", "us", "me",
  "the", "a", "an",
  "this", "that", "these", "those",
  "and", "but", "or", "nor", "yet", "so",
  "is", "was", "were", "are", "be", "been", "being",
  "has", "have", "had", "do", "does", "did",
  "will", "would", "shall", "should", "can", "could", "may", "might", "must",
  "man", "woman", "boy", "girl", "child", "men", "women",
  "old", "young", "good", "great", "first", "last",
  "king", "queen", "prince", "princess", "lord", "lady", "sir",
  "father", "mother", "son", "daughter", "brother", "sister",
  "stranger", "beggar", "guest", "host", "friend",
  "voice", "sound", "cry", "shout", "whisper", "laugh", "sigh",
  "no", "yes", "here", "there", "now", "then",
  "all", "some", "any", "none", "both", "each", "every",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "after", "before", "during", "while", "since", "until",
  "into", "onto", "upon", "over", "under", "above", "below", "between",
  "with", "without", "from", "to", "toward", "towards",
  "in", "on", "at", "by", "for", "of", "about",
]);

/** Convert a raw (possibly periphrastic) speaker name to canonical form.
 *  Returns `null` if the candidate is a pronoun/article (not a name). */
export function canonicalizeSpeaker(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  // Reject pronouns / articles / non-name words.
  if (NON_NAME_WORDS.has(lower)) return null;
  if (KNOWN_SPEAKERS[lower]) return KNOWN_SPEAKERS[lower];
  if (lower.startsWith("the ")) {
    const stripped = lower.slice(4);
    if (NON_NAME_WORDS.has(stripped)) return null;
    if (KNOWN_SPEAKERS[stripped]) return KNOWN_SPEAKERS[stripped];
    if (stripped === "goddess" || stripped === "goddess of war" || stripped === "grey-eyed goddess") return "Athena";
    if (stripped === "god" || stripped === "god of the sea" || stripped === "earthshaker") return "Poseidon";
    if (stripped === "king" || stripped === "king of the gods" || stripped === "father") return "Zeus";
    if (stripped === "old man" || stripped === "old swineherd" || stripped === "swineherd") return "Eumaeus";
    if (stripped === "queen") return "Penelope";
    if (stripped === "boy" || stripped === "young man" || stripped === "prince") return "Telemachus";
    if (stripped === "stranger" || stripped === "beggar" || stripped === "tramp" || stripped === "wanderer") return "Odysseus";
    if (stripped === "messenger") return "Hermes";
    if (stripped === "bard" || stripped === "singer") return "Phemius";
    if (stripped === "nurse") return "Eurycleia";
    // Reject if the stripped form is still a non-name word (e.g. "The old")
    return null;
  }
  // Honorifics: "Queen Penelope" → "Penelope"
  for (const key of Object.keys(KNOWN_SPEAKERS)) {
    if (lower.endsWith(" " + key)) return KNOWN_SPEAKERS[key];
  }
  // Single-word capitalized candidate that's not in KNOWN_SPEAKERS:
  // accept it as a literal name only if it's capitalized (proper noun).
  if (/^[A-Z][a-zA-Z]{2,}$/.test(raw)) {
    return raw;
  }
  // Lowercase candidate that's not a known name: reject (probably a pronoun
  // or verb that slipped through).
  if (/^[a-z]+$/.test(raw)) {
    return null;
  }
  return raw;
}

/** Convert a canonical speaker name to a stable narrator id slug. */
export function speakerToId(name: string): string {
  return "speaker:" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Inverse of speakerToId: extract the display name from a speaker id. */
export function speakerIdToName(id: string): string {
  if (!id.startsWith("speaker:")) return id;
  const raw = id.slice("speaker:".length).replace(/-/g, " ");
  return canonicalizeSpeakerName(raw);
}

/** Take a hyphenated slug name and try to canonicalize it back to a proper noun. */
export function canonicalizeSpeakerName(slugName: string): string {
  // Try direct lookup of the slug-as-name
  const lower = slugName.toLowerCase();
  if (KNOWN_SPEAKERS[lower]) return KNOWN_SPEAKERS[lower];
  // Capitalize each word as a fallback
  return slugName
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
