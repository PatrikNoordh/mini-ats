// The app calls Edge Functions from the browser with the user's JWT in the Authorization header.
// No cookies are involved, so allowing any origin does not let another site act as the user.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** A JSON response with the CORS headers. Errors are `{ error: "<code>" }`, never user-facing text. */
export function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: corsHeaders });
}
