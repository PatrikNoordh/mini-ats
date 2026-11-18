import { assertEquals } from "jsr:@std/assert@1.0.13";

import { inviteRefusal } from "./invites.ts";

Deno.test("an account that is already confirmed cannot be invited", () => {
  assertEquals(inviteRefusal({ code: "email_exists", status: 422 }), "already_confirmed");
});

Deno.test("an email Auth could not send is worth trying again", () => {
  const cases = [
    { code: "email_address_not_authorized", status: 400 },
    { code: "over_email_send_rate_limit", status: 429 },
    { code: "unexpected_failure", status: 500 },
    { status: 503 },
  ];
  for (const error of cases) assertEquals(inviteRefusal(error), "not_sent");
});

Deno.test("any other Auth error is not about the invite", () => {
  for (const error of [{ code: "validation_failed", status: 400 }, {}]) {
    assertEquals(inviteRefusal(error), null);
  }
});
