-- =============================================================================
-- applications.customer_id is never sent by the client (CLAUDE.md, security rule 7)
--
-- The trigger set_application_customer() always sets customer_id from the job. The column had
-- no default, so the generated Insert type required the client to send a value anyway. With a
-- default the field is optional and the app leaves it out. The trigger still overwrites whatever
-- the default gives, so it only has to be a valid placeholder: the caller's own id.
-- =============================================================================
alter table public.applications alter column customer_id set default auth.uid();
