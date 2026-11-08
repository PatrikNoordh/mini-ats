---
name: ats-data-safety
description: "Check that no Mini-ATS data is lost or left half done, and that no customer can see or change another customer's data. Diff mode (default) checks the current branch against docs/data-safety.md and reads only the chains the diff touches; full mode checks the whole schema, policies, Edge Functions and scripts and rebuilds the map. Use when asked for a data-safety check, from /ats-review-pr (diff) and /ats-epic-close (full), or before a migration that changes who owns rows."
argument-hint: "diff (default) or full. diff checks the current branch against main"
allowed-tools: Bash(git diff *), Bash(git log --oneline *), Bash(git rev-parse *), Bash(grep -rn *), Read, Glob, Grep
---

# Data safety check — Mini-ATS

Checks two things: **no important data is lost or left half done**, and **no customer can see or change another customer's data**. The map in `docs/data-safety.md` says where each piece of data lives, what a delete takes with it, who may read and write it, which guard stops each mistake, and which test proves the guard. This skill checks a change against the map, or the whole app, and keeps the map true.

The mode is: `$ARGUMENTS` (empty means `diff`).

**Never run a remote Supabase command**, not even a read-only one (`CLAUDE.md` § Workflow). When the check needs something from the project (the applied migrations, a policy as it is there, a function's deploy date), print the command for the developer to run and paste back. `.claude/settings.json` refuses the remote commands anyway.

---

## Diff mode

### Step 1 — Is a data path touched?

```bash
git diff origin/main...HEAD --name-only
```

The data paths are `supabase/`, `src/lib/api/`, `src/hooks/`, `src/lib/save-candidate.ts`, `src/lib/candidate-cv.ts`, `scripts/`, `e2e/fixtures.ts`, `.github/workflows/`, `.claude/settings.json` and `package.json` (for the pinned CLI).

If none is touched, answer in one line and stop:

```
Data safety: no data path touched (<n> files, all <UI / docs / tests>). Nothing to check.
```

### Step 2 — Read only what the diff reaches

1. Read `docs/data-safety.md`.
2. Read the diff of the data paths: `git diff origin/main...HEAD -- <paths>`.
3. For each changed table, function, policy, bucket or flow, find its rows in the map (§ 1 to § 6) and read the files those rows name: the migration that last defined it, the Edge Function handler, the `src/lib/api/` file, the checks in `supabase/tests/rls_test.sql`. Follow a delete chain one step past the changed table in each direction (what references it, and what it references).
4. Do not read the rest of the repo. If the map has no row for something the diff changes, that is a finding in itself (the map is out of date), and read just enough to describe it.

### Step 3 — The lenses

Ask each question of every change the diff reaches. Each one that gets a "yes" or "not sure" becomes a row in the risk table.

| Lens | Questions |
|---|---|
| **Order, repeat, half done, who** | Can the steps run in the wrong order? What happens if it runs twice, or stops halfway? Can the wrong person run it: a customer instead of an admin, a deleted account, `anon`, Claude instead of the developer? |
| **References and deletes** | What references this row, and what does it reference? With which `on delete`? Where does a delete spread, and does it reach data it should not, or stop short and leave orphans? Is `no action` versus `restrict` still right? |
| **Database and Storage** | Does a flow write to both without a shared transaction? Which order did it choose, and is its worst case written down in § 4? Can it leave a file no row points at? |
| **Between `db push` and merge** | The migration reaches the project before the merge, so the code on `main` runs against it. Does that code still work: an added column with a default or nullable, a drop or rename only once `main` no longer uses it? What if the PR is closed after the push? |
| **Ids and shared values** | Does an id ever change? Do two concepts share one value (today the Auth user, the profile, the row owner and the CV folder), and does the change treat one as the other? Is a placeholder (the nil UUID) ever stored as real? |
| **Guards in layers** | Which layers guard this: structure, schema, CI test, tool check, permission? Does the change remove or weaken one? Does the change rest on the frontend alone (rule 6)? Does a new table have RLS, policies and explicit grants (rule 5)? Does a new definer function check its caller? |
| **Proof** | For every guard the change adds or relies on: is there a test that fails when the guard is removed? Name the file and check number. A guard without such a test is a gap, not a guard. |

Security rules 1 to 9 in `CLAUDE.md` apply throughout: the service role only in Edge Functions for their one privileged action, reads with the caller's JWT, `profiles.role` as the role, `customer_id` from triggers for `applications` and `cv_assessments`.

### Step 4 — Report

```
## Data safety — <branch or PR>

Mode: diff. Data paths touched: <list>. Map rows read: <§ and rows>.

| Risk | What happens | Severity | Guard | Test |
|---|---|---|---|---|
| <the change and the lens> | <the concrete outcome, with the rows or files affected> | 🔴 / 🟡 / 🟢 | <what stops it, with its layer, or "none"> | <file:check, or "none"> |

Map: <updated § n, rows …> / <no change needed>
Commands for the developer: <only if something has to be checked on the project, else "none">
```

Severity:

- 🔴 **Data lost, or seen or changed by another customer.** A blocker: fixed on the branch before the merge.
- 🟡 **Half done but recoverable**, or a guard without a test. Fixed on the branch if quick, otherwise one line in `TICKETS.md`.
- 🟢 **Cosmetic**: a stale map row, a comment that overstates a guard.

When every lens comes out clean, say so in one line under the table, and list the guards and tests that make it clean.

### Step 5 — Keep the map true

If the diff changes a chain, a policy, a grant, a guard, a flow across the database and Storage, or a human step, update the matching rows of `docs/data-safety.md` on the branch, in the same words the map uses. Add a row for anything new. A gap goes in § 7 only once it has a line in `TICKETS.md` or an issue.

---

## Full mode

The same lenses over everything: every migration, every policy and grant, every definer function, every Edge Function, every script and the CI workflow. It rebuilds the map from what is really there, not from the old map.

1. **Build the schema.** Read `supabase/migrations/` in order. If Docker is available, apply them to a fresh throwaway Postgres the way the CI `rls` job does (`supabase/tests/local_stub.sql`, then each migration, then `supabase/tests/rls_test.sql`), never to the local Supabase stack's data and never to the project, and read the result:

   ```sql
   -- foreign keys and their on delete
   select conrelid::regclass, conname, pg_get_constraintdef(oid)
   from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace order by 1;
   -- RLS on every table
   select relname, relrowsecurity from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;
   -- policies, also on storage.objects
   select schemaname, tablename, policyname, cmd, qual, with_check
   from pg_policies where schemaname in ('public', 'storage') order by 1, 2, 4;
   -- table and column grants
   select table_name, grantee, string_agg(privilege_type, ',')
   from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated') group by 1, 2 order by 1, 2;
   select table_name, privilege_type, string_agg(column_name, ',')
   from information_schema.column_privileges
   where table_schema = 'public' and grantee = 'authenticated'
     and privilege_type in ('INSERT', 'UPDATE') group by 1, 2 order by 1, 2;
   -- triggers, and functions with their security mode and who may run them
   select tgrelid::regclass, tgname, pg_get_triggerdef(oid) from pg_trigger where not tgisinternal order by 1, 2;
   select proname, pg_get_function_identity_arguments(oid), prosecdef, proacl
   from pg_proc where pronamespace = 'public'::regnamespace order by 1;
   -- check constraints, unique keys and buckets
   select conrelid::regclass, conname, pg_get_constraintdef(oid)
   from pg_constraint where contype in ('c', 'u') and connamespace = 'public'::regnamespace order by 1;
   select id, public, file_size_limit, allowed_mime_types from storage.buckets;
   ```

   Without Docker, read the migrations and note in the report that the schema was read, not built.

2. **Read the Edge Functions** (`supabase/functions/*/index.ts` and `handler.ts`): who the caller must be, which client reads, what the service role does, and the order of each step across the database and Storage.
3. **Read the data layer and the scripts**: `src/lib/api/`, `src/lib/save-candidate.ts`, `src/lib/candidate-cv.ts`, `scripts/`, `e2e/fixtures.ts`, `.github/workflows/ci.yml`, `.claude/settings.json`, `package.json`.
4. **Map every guard to its proof**: the `OK <n>:` lines in `rls_test.sql`, the concurrency scripts, the Deno handler tests, the end-to-end specs. A guard nobody tests goes in § 7.
5. **Try what looks open.** When a lens suggests a gap, prove it in the throwaway database inside a transaction that is rolled back, as the role that would exploit it, before writing it down.
6. **Check the decisions** in § 5 one by one against the code; each must still hold.
7. **Rewrite `docs/data-safety.md`**: § 1 to § 7, the date and the `main` sha of this run. Keep the rules at the top of the file.
8. **Report** the risk table as in diff mode, for the whole app, and a short list of what changed in the map since the last full run (`git diff` of the file). The findings go where `/ats-epic-close` puts them; fixing them is never part of this run.

---

## Rules

- Never run a remote Supabase command; print it for the developer.
- Never write a secret, real data or an exploit to `docs/data-safety.md`, an issue or a review: the repo is public. A gap that lets a customer reach another customer's data goes to an issue with the `security` label before it goes in the map, and once there are real customers, to a private GitHub security advisory instead.
- Never call something a guard without naming its proof, or "none".
- Do not fix findings from this skill unless the caller says so: `/ats-review-pr` fixes 🔴 on the branch, `/ats-epic-close` triages the rest.
- In diff mode, never read past the chains the diff reaches. The map is there so the check stays small.
