import { FunctionsHttpError } from "@supabase/supabase-js";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { AppError, toErrorCode, type ErrorCode } from "@/lib/errors";

const errorBodySchema = z.object({ error: z.string() });

/**
 * The code for a failed Edge Function call. A 401 comes from the Supabase gateway or from the
 * function, with different bodies, so the status decides. Otherwise the body's `error` code.
 */
export async function functionErrorCode(error: unknown): Promise<ErrorCode | null> {
  if (!(error instanceof FunctionsHttpError) || !(error.context instanceof Response)) return null;
  if (error.context.status === 401) return "not_authenticated";
  const body = errorBodySchema.safeParse(await error.context.json().catch(() => null));
  return body.success ? toErrorCode(body.data.error) : null;
}

/** Calls an Edge Function with the signed-in user's JWT. Failures throw an AppError when known. */
export async function invokeFunction(name: string, body: object): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const code = await functionErrorCode(error);
    throw code ? new AppError(code) : error;
  }
  return data;
}
