import { createClient } from "@supabase/supabase-js";

import { localStack } from "../scripts/local-stack.ts";
import { buttonLink, emailTo, expect, serviceClient, test, type Email } from "./fixtures.ts";

// Auth's own emails (ATS-49): each is sent with the template in supabase/templates/ and lands in
// the local stack's Mailpit inbox. The whole invite, accepted in the app, is in invite.spec.ts.

function expectBothLanguages(email: Email) {
  expect(email.html).toContain('<html lang="sv">');
  expect(email.html).toContain('<div lang="en">');
}

test("the invite email uses our template and links to the app's accept-invite page", async ({
  baseURL,
  tag,
  users,
}) => {
  const address = `invited-${tag}@e2e.test`;
  const { data, error } = await serviceClient().auth.admin.inviteUserByEmail(address);
  if (error) throw error;
  users.push(data.user.id);

  const email = await emailTo(address);
  expect(email.subject).toBe("Du är inbjuden till Mini-ATS · You are invited to Mini-ATS");
  expectBothLanguages(email);

  // The app's own page with the token, not Auth's one-time link (ATS-50).
  const link = new URL(buttonLink(email.html));
  expect(link.origin).toBe(new URL(baseURL ?? "").origin);
  expect(link.pathname).toBe("/accept-invite");
  expect(link.searchParams.get("type")).toBe("invite");
  expect(link.searchParams.get("token_hash")).toMatch(/^\w+$/);
});

test("the recovery email uses our template and its link signs the user in", async ({
  request,
  baseURL,
  makeCustomer,
}) => {
  const address = (await makeCustomer("Kund")).email;
  const stack = localStack();
  const anon = createClient(stack.url, stack.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sent = await anon.auth.resetPasswordForEmail(address);
  if (sent.error) throw sent.error;

  const email = await emailTo(address);
  expect(email.subject).toBe("Återställ ditt lösenord · Reset your password");
  expectBothLanguages(email);

  // Auth checks the one-time token and sends the browser on to the app with a session.
  const response = await request.get(buttonLink(email.html), { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  const target = new URL(response.headers()["location"] ?? "");
  expect(target.origin).toBe(new URL(baseURL ?? "").origin);
  const session = new URLSearchParams(target.hash.slice(1));
  expect(session.get("type")).toBe("recovery");

  const signedIn = await serviceClient().auth.getUser(session.get("access_token") ?? "");
  expect(signedIn.data.user?.email).toBe(address);
});
