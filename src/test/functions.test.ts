import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { functionErrorCode } from "@/lib/api/functions";
import { toErrorCode } from "@/lib/errors";
import { roleSchema } from "@/lib/validation";

const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), { status }));

describe("Edge Function error codes", () => {
  it("reads the code from the function's body", async () => {
    expect(await functionErrorCode(httpError(409, { error: "email_exists" }))).toBe("email_exists");
    expect(await functionErrorCode(httpError(403, { error: "forbidden" }))).toBe("forbidden");
    expect(
      await functionErrorCode(httpError(400, { error: "invalid_input", fields: ["email"] })),
    ).toBe("invalid_input");
  });

  it("treats every 401 as signed out, also the gateway's own body", async () => {
    const gateway = { code: "UNAUTHORIZED_INVALID_JWT_FORMAT", message: "Invalid JWT" };
    expect(await functionErrorCode(httpError(401, gateway))).toBe("not_authenticated");
    expect(await functionErrorCode(httpError(401, { error: "not_authenticated" }))).toBe(
      "not_authenticated",
    );
  });

  it("leaves codes the app does not know, odd bodies and network failures to unknown", async () => {
    expect(await functionErrorCode(httpError(405, { error: "method_not_allowed" }))).toBeNull();
    expect(await functionErrorCode(httpError(500, "not an object"))).toBeNull();
    expect(
      await functionErrorCode(new FunctionsHttpError(new Response("<html>", { status: 502 }))),
    ).toBeNull();
    expect(await functionErrorCode(new FunctionsFetchError({}))).toBeNull();
    expect(await functionErrorCode(new Error("boom"))).toBeNull();
  });
});

describe("toErrorCode", () => {
  it("accepts only codes in ERROR_CODES", () => {
    expect(toErrorCode("email_exists")).toBe("email_exists");
    expect(toErrorCode("method_not_allowed")).toBeNull();
    expect(toErrorCode(undefined)).toBeNull();
  });
});

describe("roleSchema", () => {
  it("accepts the two roles and nothing else", () => {
    expect(roleSchema.safeParse("admin").success).toBe(true);
    expect(roleSchema.safeParse("customer").success).toBe(true);
    expect(roleSchema.safeParse("owner").success).toBe(false);
    expect(roleSchema.safeParse("").success).toBe(false);
  });
});
