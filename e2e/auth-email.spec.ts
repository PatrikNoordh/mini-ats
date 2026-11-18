import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { localStack } from "../scripts/local-stack.ts";
import { expect, serviceClient, test } from "./fixtures.ts";

// Auth's own emails (ATS-49): each is sent with the template in supabase/templates/, lands in the
// local stack's Mailpit inbox, and its link signs the user in through the app's own URL.

/** How long Auth may take to hand an email to Mailpit. */
const MAIL_TIMEOUT_MS = 10_000;

interface Email {
  subject: string;
  html: string;
}

// The parts of Mailpit's API the tests read.
const searchSchema = z.object({
  messages: z.array(z.object({ ID: z.string(), Subject: z.string() })),
});
const messageSchema = z.object({ HTML: z.string() });

/** The newest email Mailpit holds for the address, once it has arrived. */
async function emailTo(address: string): Promise<Email> {
  const inbox = localStack().mailpitUrl;
  let id = "";
  let subject = "";
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:"${address}"`);
        const response = await fetch(`${inbox}/api/v1/search?query=${query}`);
        const found = searchSchema.parse(await response.json()).messages[0];
        id = found?.ID ?? "";
        subject = found?.Subject ?? "";
        return id;
      },
      { timeout: MAIL_TIMEOUT_MS },
    )
    .not.toBe("");
  const response = await fetch(`${inbox}/api/v1/message/${id}`);
  return { subject, html: messageSchema.parse(await response.json()).HTML };
}

/** The address the email's button points to, with the HTML entities in it decoded. */
function buttonLink(html: string): string {
  const href = /<a\s+href="([^"]+)"/.exec(html)?.[1];
  if (!href) throw new Error("The email has no link.");
  return href.replaceAll("&amp;", "&");
}

function expectBothLanguages(email: Email) {
  expect(email.html).toContain('<html lang="sv">');
  expect(email.html).toContain('<div lang="en">');
}

for (const flow of [
  {
    type: "invite",
    subject: "Du är inbjuden till Mini-ATS · You are invited to Mini-ATS",
    send: async (email: string, users: string[]) => {
      const { data, error } = await serviceClient().auth.admin.inviteUserByEmail(email);
      if (error) throw error;
      users.push(data.user.id);
    },
  },
  {
    type: "recovery",
    subject: "Återställ ditt lösenord · Reset your password",
    send: async (email: string) => {
      const stack = localStack();
      const anon = createClient(stack.url, stack.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await anon.auth.resetPasswordForEmail(email);
      if (error) throw error;
    },
  },
] as const)
  test(`the ${flow.type} email uses our template and its link signs the user in`, async ({
    request,
    baseURL,
    makeCustomer,
    tag,
    users,
  }) => {
    const address =
      flow.type === "invite" ? `invited-${tag}@e2e.test` : (await makeCustomer("Kund")).email;

    await flow.send(address, users);
    const email = await emailTo(address);

    expect(email.subject).toBe(flow.subject);
    expectBothLanguages(email);

    // Auth checks the one-time token and sends the browser on to the app with a session.
    const response = await request.get(buttonLink(email.html), { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    const target = new URL(response.headers()["location"] ?? "");
    expect(target.origin).toBe(new URL(baseURL ?? "").origin);
    const session = new URLSearchParams(target.hash.slice(1));
    expect(session.get("type")).toBe(flow.type);

    const signedIn = await serviceClient().auth.getUser(session.get("access_token") ?? "");
    expect(signedIn.data.user?.email).toBe(address);
  });
