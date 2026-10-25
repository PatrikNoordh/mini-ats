import { assertEquals } from "jsr:@std/assert@1.0.13";

import { utf8Length } from "./text.ts";

Deno.test("counts UTF-8 bytes, so å, ä and ö count as two", () => {
  assertEquals(utf8Length("abc"), 3);
  assertEquals(utf8Length("åäö"), 6);
  assertEquals(utf8Length(""), 0);
});
