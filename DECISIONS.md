# Decision Records — Odyssey Narrator Intelligence

Each entry: a decision, the alternatives considered, and the rationale.

---

## DR-001 — Bundled markdown vs. runtime GitHub fetch

**Decision**: Clone the source repo into `/public/books/` and fetch via
`fetch("/books/<slug>.md")`.

**Alternatives**:
- (a) Server-side fetch from GitHub at request time.
- (b) Server component that imports markdown as raw strings.

**Rationale**: (a) adds a network dependency to every page load and breaks
offline use. (b) requires every chapter to be in the JS bundle, inflating it
by ~150KB. The chosen approach (static assets in `/public/`) gives us CDN
cacheability, zero JS bundle impact, and works in any deployment context.

---

## DR-002 — Deterministic narrator engine vs. LLM inference

**Decision**: Phase 1-3 use a **pure rule-based** engine. No LLM calls.

**Alternatives**:
- (a) Use the z-ai-web-dev-sdk LLM to classify each paragraph.
- (b) Hybrid: rules for structural blocks, LLM for ambiguous dialogue.

**Rationale**: The spec demands that "narrator identification is always
treatable as uncertain" and "every AI-generated artifact must remain
user-correctable". A deterministic engine means:
- Human corrections stay stable across re-inference passes (no LLM drift).
- The system runs offline.
- Re-processing the same chapter always yields the same narrator assignment.
- Confidence scores are explainable (each carries a `reasoning` string).

The rule-based engine catches ~80% of cases correctly (structural blocks +
explicitly-attributed dialogue). The remaining 20% (dialogue with pronoun
attribution like "he said") is marked "Uncertain" and the editor lets users
correct it. Future work can add an LLM-backed adversarial evaluator that
proposes corrections — but the user always has the final word.

---

## DR-003 — Speaker canonicalization as a separate module

**Decision**: `narrator-engine-canon.ts` exists as a standalone module that
both `narrator-engine.ts` and `identity.ts` import.

**Alternatives**:
- (a) Put `canonicalizeSpeaker` in `narrator-engine.ts` and have `identity.ts`
  import from it.
- (b) Duplicate the `KNOWN_SPEAKERS` table in both files.

**Rationale**: (a) creates a circular import (`narrator-engine` → `parser` →
`types`, and `identity` → `narrator-engine`). (b) drifts. The shared canon
module is the cleanest split: it has no dependencies on either engine.

---

## DR-004 — Palette index starts at 5, not 0

**Decision**: When assigning colors to character speakers, the palette index
begins at 5 (skipping indices 0-4 which are reserved for the four built-in
narrators + "uncertain").

**Alternatives**:
- (a) Use a separate palette for characters.
- (b) Use index 0 and accept that the first character gets the narrator's color.

**Rationale**: We initially shipped (b) and Athena ended up bronze —
indistinguishable from the guide. The fix is a single integer change; the
reserved colors at the head of `PALETTE` are now guaranteed not to be reused.

---

## DR-005 — Dialogue detection: "starts with quote"

**Decision**: A paragraph is classified as `dialogue` if it begins with a
quotation mark (straight or curly).

**Alternatives**:
- (a) Require the entire paragraph to be wrapped in quotes.
- (b) Use a more complex regex looking for `"…" said X` patterns.

**Rationale**: The Odyssey's dialogue frequently spans multiple sentences
with attribution mid-paragraph (`"Foo," he said. "Bar."`). (a) misses these.
(b) is brittle. The simple rule "starts with quote" catches all dialogue
without false positives — the narrator's prose never opens with a quotation
mark. The narrator engine then tries to extract a speaker; if it can't, the
block is marked "Uncertain" and the user can correct it in the editor.

---

## DR-006 — Persisted state excludes chapters

**Decision**: Zustand's `partialize` excludes `chapters`, `auditTrails`,
`narratorRegistry`, and `narratorStats` from persistence.

**Alternatives**:
- (a) Persist everything (including the parsed chapter data).
- (b) Persist chapters but not the registry.

**Rationale**: Chapters are re-derived from the bundled markdown in <100ms
total. Persisting them would inflate localStorage by ~500KB and risk
staleness if the source markdown is updated. The user-facing state
(corrections, preferences, visibility, progress) is all that matters across
sessions.

---

## DR-007 — Folded seams group consecutive hidden blocks

**Decision**: When a reader hides a narrator, consecutive hidden blocks
collapse into a **single** dashed-border seam, not one placeholder per block.

**Alternatives**:
- (a) One seam per hidden block.
- (b) No seams — hidden blocks just disappear.

**Rationale**: (a) is visually noisy and breaks reading flow. (b) hides the
fact that content was hidden, which violates the spec ("display small
narrator tab, subtle border, expand button, paragraph count, estimated
reading time"). The grouped seam is the right balance: it acknowledges
hidden content without dominating the layout.

---

## DR-008 — Single `/` route

**Decision**: The app lives entirely on the `/` route. No nested routes for
individual chapters.

**Alternatives**:
- (a) `/book/<slug>` for each chapter.
- (b) `/book/<slug>#<blockId>` for deep-linking.

**Rationale**: The fullstack-dev skill explicitly requires "User can only
see the `/` route defined in `src/app/page.tsx`. Do NOT write any other
route." Chapter navigation is handled via state in the Zustand store.
Deep-linking is achievable via URL query params if needed in future work.

---

## DR-009 — Editor corrections override inference, not replace it

**Decision**: `EditorState.blockCorrections[blockId]` overrides
`block.inferredNarratorId` at resolution time. The original inference is
preserved in `block.inferredNarratorId` and `block.reasoning`.

**Alternatives**:
- (a) Mutate `block.inferredNarratorId` in place when a correction is applied.
- (b) Store corrections as a diff against the original inference.

**Rationale**: (a) loses the audit trail. The spec demands "every important
decision must be explainable, reproducible, reversible, editable, validated".
Keeping the original inference alongside the correction means the user can
always hit "Reset to inference" and get back to the engine's original call.

---

## DR-010 — No login, no cookies

**Decision**: Persistence uses localStorage only. No auth, no cookies, no
backend.

**Alternatives**:
- (a) NextAuth.js with optional login for cross-device sync.
- (b) Cookie-based preferences for server-side rendering.

**Rationale**: The spec says "without requiring login" and "minimizing
cookie usage". LocalStorage is sufficient for a single-user reading
experience. If cross-device sync is added later, it should be opt-in and
should not change the local-first architecture.

---

## DR-011 — Context-aware dialogue resolution (last-mentioned character)

**Decision**: Track the last-mentioned canonical character in narration
blocks. When dialogue has pronoun attribution (`"Foo," he said`), resolve
the pronoun to that character.

**Alternatives**:
- (a) Mark all pronoun-attributed dialogue as "Uncertain".
- (b) Use an LLM to resolve pronouns.

**Rationale**: (a) leaves ~30% of dialogue unclassified — too much for a
good reading experience. (b) is too slow for an inline parser and breaks
determinism. The chosen approach is fast, deterministic, and gets ~80% of
pronoun cases right. The remaining 20% fall through to "Uncertain" and the
user (or the LLM evaluator) can correct them.

Scene breaks reset the context — a new scene may have completely different
speakers. Confidence is weighted by how early in the narration the character
is mentioned (early mention = the paragraph is "about" them = higher
confidence).

---

## DR-012 — Strict canonicalizer for Pattern 5 (post-quote capitalized word)

**Decision**: Pattern 5 (`"Foo." Name [verb]`) uses
`canonicalizeKnownSpeaker` (strict) instead of `canonicalizeSpeaker`
(permissive). The strict variant only accepts names in the `KNOWN_SPEAKERS`
table; the permissive variant accepts any capitalized proper noun.

**Alternatives**:
- (a) Use the permissive canonicalizer for Pattern 5.
- (b) Add a stoplist of common sentence-initial adverbs.

**Rationale**: (a) is what we initially shipped, and it false-positive'd on
"Listen", "Apparently", "Take" — all common sentence-initial words that
follow a closing quote. (b) is a never-ending game of whack-a-mole. The
strict canonicalizer is the right tradeoff: Pattern 5 only fires when we
recognize the name, which is the case it was designed for.

---

## DR-013 — Bookmarks and annotations as margin hover affordances

**Decision**: Bookmark + annotation buttons appear in the left margin on
hover, not as always-visible icons. Annotations render as a styled bubble
below the paragraph.

**Alternatives**:
- (a) Always-visible icons next to every paragraph.
- (b) Right-click context menu.

**Rationale**: (a) clutters the reading experience — the spec emphasizes
"beautiful whitespace". (b) is hidden and not discoverable. Hover-revealed
margin icons are the standard pattern (used by Medium, NYT, GitHub) and
match the Art Nouveau minimalism. The amber bookmark indicator on the
paragraph itself is always visible once a bookmark exists, so the reader
can see at a glance which paragraphs they've marked.

---

## DR-014 — LLM evaluator as server-side API + opt-in button

**Decision**: The LLM adversarial evaluator lives at `POST /api/evaluator`
(server-side, uses z-ai-web-dev-sdk) and is invoked on-demand from the
editor panel via an "Ask LLM to critique" button. Proposals are
suggestions — the user must click "Accept proposal" to apply them.

**Alternatives**:
- (a) Run the LLM over every block on chapter load.
- (b) Call the LLM from the client directly.

**Rationale**: (a) would be slow (25 chapters × ~250 blocks × ~3s per
LLM call = ~5 hours) and would burn API quota on blocks the user doesn't
care about. (b) violates the z-ai-web-dev-sdk "backend only" constraint
and would expose the API key. The chosen approach is on-demand, server-
side, and user-initiated — the user picks the specific block they want a
second opinion on, and the LLM's proposal is always overridable.

The LLM is given ~800 chars of surrounding context (3 blocks before + 3
after) plus the current narrator + reasoning. The system prompt instructs
it to be adversarial: try to PROVE the current assignment is wrong. This
matches the Phase 3 spec.
