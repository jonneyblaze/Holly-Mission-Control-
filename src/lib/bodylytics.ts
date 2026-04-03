import { createClient } from "@supabase/supabase-js";

// Read-only client for BodyLytics production Supabase
// Used to fetch business metrics, goals, CRM data, feedback
export function createBodylyticsClient() {
  const url = process.env.BODYLYTICS_SUPABASE_URL;
  const key = process.env.BODYLYTICS_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing BODYLYTICS_SUPABASE_URL or BODYLYTICS_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
