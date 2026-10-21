import { AuthRetryableFetchError, FunctionsFetchError } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError, errorCode } from "@/lib/errors";

const offline = () => vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

// How each Supabase client reports a request that got no answer.
const failures = {
  "a data call": { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" },
  "fetch in Chrome": new TypeError("Failed to fetch"),
  "fetch in Firefox": new TypeError("NetworkError when attempting to fetch resource."),
  "fetch in Safari": new TypeError("Load failed"),
  "an Edge Function": new FunctionsFetchError(new TypeError("Failed to fetch")),
  "a sign-in": new AuthRetryableFetchError("Failed to fetch", 0),
};

describe("errors for requests that got no answer", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(Object.entries(failures))("%s offline is offline", (_, error) => {
    offline();
    expect(errorCode(error)).toBe("offline");
  });

  it.each(Object.entries(failures))("%s while online is network_error", (_, error) => {
    expect(errorCode(error)).toBe("network_error");
  });

  it("does not take a bug's TypeError for a network failure", () => {
    offline();
    expect(errorCode(new TypeError("Cannot read properties of undefined"))).toBe("unknown");
  });

  it("keeps a known code, also offline", () => {
    offline();
    expect(errorCode(new AppError("job_has_candidates"))).toBe("job_has_candidates");
  });
});
