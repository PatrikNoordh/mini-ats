# Next: customer-defined pipeline stages

A design sketch for after the deadline (26 October 2026). Nothing here is built yet.

## Today

The board has six fixed stages: `new → screening → interview → offer → hired`, plus `rejected`.

- **Database:** `applications.stage` is text with a check against the six names. `move_application(application_id, customer_id, new_stage)` moves a card last in its column, with an advisory lock per customer and column.
- **Frontend:** about 18 files depend on the fixed list: `STAGES`, `stageSchema` and `neighbourStage` in `src/lib/stages.ts`, the board and its keyboard moves, the candidate panel, the `stages.*` translations, the `--stage-*` colour tokens, the demo seed and the tests.
- **Stage meaning:** after a card moves to Hired, a prompt offers to move the candidate's other open cards to Rejected (ATS-31).

## The feature

A customer, or an admin acting for them, shapes their own pipeline:

- rename columns (for example "Intervju" to "Kodtest")
- add columns, up to 10
- remove columns, but never one that still has cards
- reorder columns by drag and drop, and by keyboard
- reset to the six default columns, with a simple button, if it fits the design

## Decisions

- **Admins** can do everything a customer can, through the active customer like every other customer screen. No separate editor on the accounts page.
- **Reset** brings back the six default columns with their names, colours and order. It refuses while a column it would remove still has cards, with the same hint as removing that column.
- **At most 10 columns** per customer: `MAX_PIPELINE_STAGES` in `src/lib/constants.ts`, and the database refuses the eleventh too.

## Design

### Database

1. A new table `pipeline_stages`: `id`, `customer_id`, `name` (null for an unrenamed default), `default_key` (`new`, `screening` … or null), `position`, `kind` (`open` | `hired` | `rejected`), `colour` (a key from a fixed token palette, checked by a constraint) and `created_at`. RLS and explicit grants like the other tables.
2. **A card only points at its own customer's column.** A plain foreign key only checks that the column exists, so `pipeline_stages` gets `unique (id, customer_id)` and `applications` gets `foreign key (stage_id, customer_id) references pipeline_stages (id, customer_id) on delete restrict`. The `restrict` is what stops removing a column with cards, the same way a job with candidates can't be deleted.
3. **Kind rules:** exactly one `hired` column and at least one `rejected` column per customer, so the Hired prompt keeps working. "At most one hired" is a partial unique index; "exactly one" and "at least one rejected" are a trigger on delete and on a change of `kind`, with error codes for the UI (`stage_hired_required`, `stage_rejected_required`). Names are unique per customer and have a length limit.
4. **Reordering** through `reorder_stages(customer_id, stage_ids uuid[])`, which rewrites the positions in one transaction under the same advisory lock per customer as `move_application`, so two tabs can't interleave.
5. **Two migrations, because migrations reach the project before the merge:**
   - (a) Create the table, seed the six current columns for every customer, add `stage_id` next to `stage` and backfill it, give new customers the defaults in a trigger, and add a `move_application` that takes `stage_id`. `stage_changed_at` must also update when `stage_id` changes.
   - (b) In a later PR, once no code on `main` uses it, drop `stage` and its check.
6. RLS tests: customer B cannot read, create, rename, reorder or delete customer A's columns, and cannot move a card to one of them.

### UI

- Default names stay translated (`t('stages.' + default_key)`) until the customer renames them. A name the customer types is user data and is never translated. Renaming never changes `kind`.
- A menu on each column header: rename, change colour and remove (disabled with a hint while the column has cards). An "add column" button, disabled with a hint at 10 columns, and the reset button.
- Column drag and drop with @dnd-kit sortable, with keyboard support and announcements in both languages. Works at 390 px.
- The Hired prompt uses `kind` instead of the stage name, and moves cards to the first rejected column by position.
- Filters, URL parameters and query keys use `stage_id`, and the query keys keep the active customer id: `["stages", customerId]`.
- Not affected: jobs, candidates and the AI assessments.

## Estimate

3–4 days of focused work, in 4–5 tickets: database, data layer, column management, reordering, and the cleanup migration.
