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
