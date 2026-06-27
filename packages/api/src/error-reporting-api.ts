// ── Mobile error reports API function ─────────────────────────────────────────
// Kept separate because it imports both OrbiApiClient (client.ts) and
// the error-report types (error-reporting.ts), avoiding circular deps.

import type { OrbiApiClient } from "./client.js";
import { apiRoutes } from "./routes.js";
import type {
  SubmitMobileErrorReportsPayload,
  SubmitMobileErrorReportsResponse,
} from "./error-reporting.js";

export async function submitMobileErrorReportsWithApi(
  client: OrbiApiClient,
  payload: SubmitMobileErrorReportsPayload,
) {
  return client.request<SubmitMobileErrorReportsResponse>(
    apiRoutes.mobile.errorReports,
    {
      method: "POST",
      body: payload,
    },
  );
}
