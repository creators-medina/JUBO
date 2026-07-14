# Jubo Lead-Source Backfill Plan (Phase 5.3 — plan only, nothing executed)

A documentation-only plan for backfilling historical lead-source attribution. **No backfill,
script, schema change, migration, or record update has been performed.** Every write
described below is FUTURE work, each step behind its own explicit approval gate.

Read together with `docs/JUBO_SAFETY_RULES.md` (bulk data writes always stop for approval)
and `docs/JUBO_PRODUCT_DECISIONS.md` (the 15 canonical sources).

---

## 1. Current state (verified from the codebase, Phases 5–5.2)

**Where values live.** A lead source is a `field_values.value_text` row joined to a `fields`
row with slug `lead_source` on the record's board. There is no dedicated column or table —
attribution is entirely inside the existing generic fields system. `referral_source` is a
separate text field (a *who*, not a *channel*) and is out of scope for backfill.

**Which boards have the field.**
- Template-provisioned orgs get a `Lead Source` select on lead-shaped boards (Prospecting,
  Active Leads) — historically with the legacy 6-option list (`Self-Sourced`,
  `Realtor Referral`, `Past Client`, `Purchased Lead`, `Website`, `Other`); since Phase 5,
  new workspaces seed the canonical 15.
- Any board can gain the field via the Phase 5 picker's explicit **"Set up lead source"**
  action (`ensureLeadSourceField` — idempotent, hidden-from-grid, writes no values).
- Boards likely still missing it in production: Initial Consult, Loan In Process, Closing,
  Pre-Approved, Past Clients, VIP's, Realtors (Top 40), Referral Partners, Inactive Loans.
  *This is live data — confirm with the read-only report below, never assume.*

**Aliases (Phase 5.1).** `SOURCE_ALIASES` + `canonicalSourceKeyForLabel` /
`displaySourceLabel` in `features/production-plan/calc.ts` fold obvious legacy values
(`Website`→Website Lead, `Facebook`→Facebook Ad, `Realtor`→Realtor Referral, `IG`→Instagram,
`Online`→Online Lead, `Friend`→Personal Friend, repeat/referral past-client phrasings) into
canonical labels **for display/reporting only**. Stored values are untouched.

**Deliberately ambiguous (never auto-mapped).** `Past Client` (repeat vs referral is not
decidable from the value), `Self-Sourced`, `Purchased Lead`, generic `Referral`, and any
unrecognized import value (`Zillow`, partner names, etc.). These render as their own rows.

**Imports.** The auto-mapper already maps `lead source`/`source` columns → `lead_source`
(and `referred by` → `referral_source`), so future imports self-attribute. Historical
imports only carried a source if the original CSV had such a column.

**Unknowns that require live data (cannot be read from the repo):** which boards actually
have the field today, how many records are assigned vs unassigned, and the exact set of
legacy values present. The plan's first phase exists to answer these.

---

## 2. What accurate backfill would need (per record)

1. **The original import file** (`onboarding_uploads` audit rows + the LO's source CSVs) —
   the only trustworthy bulk source of per-record channel data.
2. **Record provenance** — created-in board, creation date, importer (`created_by`),
   `record_movements` history. Provenance narrows candidates; it must never *decide* (a
   record on Realtors (Top 40) is a realtor, not necessarily realtor-*sourced* business).
3. **The LO's memory** for high-value records — funded loans and active pipeline are few
   enough to review by hand and matter most to reporting.
4. **Existing stored values** — for the *normalization* sub-case (a value exists but is
   legacy-spelled), no external data is needed at all.

**What must NEVER be inferred:** source from board name or theme day; source from stage;
repeat-vs-referral for `Past Client`; source from activity text guessing; any default
applied to unassigned records. An empty source is honest; a guessed one is corrupted data.

---

## 3. Recommended approach — UI-assisted review, report first, scripts last

A user-facing review workflow is **safer than a script** for everything except pure
spelling normalization: every write is individually confirmed by the LO through the
existing `upsertFieldValue` path (RLS-scoped, activity-logged, workflow-event-correct),
there is no all-at-once failure mode, and "rollback" is just editing the record again.
Scripts bypass review, fire (or skip) workflow events in bulk, and turn one wrong mapping
into hundreds of wrong rows.

### Phase A — Attribution coverage report (read-only; no approval needed beyond a normal PR)
Build a small report (or run read-only queries) listing: boards with/without the field;
assigned vs unassigned counts per board and per Greatness metric (reusing the Phase 5.2
attribution sets); the distinct stored values with row counts, split into
canonical / alias-mapped / ambiguous / unknown. **Export this as CSV before anything else —
it is both the work-list and the baseline snapshot.**

### Phase B — Field provisioning where missing (gated: live field inserts)
Provision `lead_source` on approved boards via the existing `ensureLeadSourceField`
mechanism (per board, idempotent, no values written). Options: the LO clicks the picker's
setup button per board (already shipped, zero new code), or a one-time approved action
covering a named board list. Approval names the exact boards.

### Phase C — Stored-value normalization (gated: bulk write; the ONLY script-appropriate step)
Rewrite values that already unambiguously mean a canonical source (`Website` →
`Website Lead`, etc.) — exactly the Phase 5.1 alias list, nothing looser. Requirements:
**dry-run first** (print `record_id, board, old → new`, write nothing), **CSV export of
every old value** (the rollback artifact — `field_values` keeps no history), explicit
approval of the value-mapping table, execution in bounded batches through supabase updates
scoped to `(field_id, record_id)` pairs from the dry-run, and a decision on workflow
events (bulk select-changes firing `record.field_changed` should be consciously accepted
or the rows updated via the same reviewed path with automations quiesced). Ambiguous
values are **excluded** — they keep their raw text and their honest reporting rows.

### Phase D — Guided manual attribution for unassigned records (LO-driven; no bulk writes)
A "Needs lead source" review queue (filter: records with the field but no value), ordered
by value: funded YTD → pipeline → pre-approved → recent leads → everything else. Optional
*suggestions* (from import-file matches only) may be displayed but are **never pre-applied**
— the LO picks; every save is one `upsertFieldValue`. Old records may legitimately remain
Unassigned forever; the reporting already handles that honestly.

### Phase E — Optional import-file re-attribution (gated: bulk write, only if Phase A shows
original CSVs contained source columns). Match import rows to records by the import
pipeline's own identifiers (never fuzzy name-matching), dry-run + export + approval as in
Phase C, and only fill records that are currently **empty** — never overwrite an existing
value.

---

## 4. Risks (exact)

| Risk | Mitigation |
|---|---|
| Wrong bulk mapping corrupts attribution at scale | Alias-list-only normalization; dry-run + human-approved mapping table; batches |
| No value history in `field_values` → overwrite is destructive | CSV snapshot of old values BEFORE any write is the mandatory rollback artifact |
| Bulk select changes fire `record.field_changed` workflow events | Decide per run: accept, or quiesce automations during the batch |
| Cross-board duplicates (a record's old-board field values persist) | Attribution reads first-non-empty value; normalization must target the same resolution order |
| Import matching errors (Phase E) | Pipeline identifiers only; empty-only fills; no fuzzy matching |
| Silent scope creep ("while we're at it") | Each phase is its own approval; approvals name exact boards/values/counts |

**Rollback plan:** Phases B (field rows are inert if unused; removable via existing field
deletion if truly needed), C/E (restore from the pre-write CSV via the same
`(field_id, record_id)` targeting — which itself is a gated bulk write, hence the snapshot
is non-negotiable), D (individual edits; no bulk state to roll back).

## 5. Approval gates before ANY execution

1. Phase A report reviewed by the user — no execution without measured reality.
2. Phase B: explicit board list approved.
3. Phase C: value-mapping table + dry-run output + rollback CSV location approved; batch
   size and workflow-event decision approved.
4. Phase D: UI feature ships as a normal reviewed PR (writes are per-record, LO-initiated).
5. Phase E: only if Phase A proves source columns exist; same gates as C plus the matching
   method.
6. Standing rule regardless of phase: **no schema, no migrations, nothing inferred, nothing
   overwritten, unassigned stays visible.**

**Recommended first step:** Phase A — build/run the read-only coverage report and bring the
numbers back for a decision.
