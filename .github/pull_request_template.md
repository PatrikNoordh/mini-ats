## [ATS-<N>] <Title>

Closes #<issue number>

### Summary

<!-- One or two sentences: what was built and why. -->

### What Changed

1. **Database** — <!-- migrations, RLS, or "Not touched" -->
2. **Edge Functions** — <!-- or "Not touched" -->
3. **Data layer** — <!-- src/lib/api, src/hooks, or "Not touched" -->
4. **UI** — <!-- routes, components, or "Not touched" -->
5. **Tests** — <!-- or "Not touched" -->

### Acceptance Criteria

<!-- Every AC from the issue. Unchecked ones say why. -->

- [ ] AC1:

### Manual Test Steps

<!-- Say which role each step uses: admin acting for a customer, customer A, customer B. -->

1.

### Tradeoffs

<!-- Decisions, deferrals, new dependencies, schema changes. -->

-

### Validation

- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build` pass
- [ ] RLS tests pass (CI), if `supabase/` changed
- [ ] Tested manually as admin and as customer
