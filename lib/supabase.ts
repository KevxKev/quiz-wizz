import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

type SupabaseErrorShape = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

export function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseSetupMessage() {
  return "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server.";
}

export function getSupabaseEnvTemplate() {
  return [
    "NEXT_PUBLIC_SITE_URL=http://192.168.2.15:3001",
    "NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY",
  ].join("\n");
}

export function getSupabaseProjectHost() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    return null;
  }

  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function extractSupabaseErrorText(error: unknown, fallback: string) {
  if (!error) {
    return fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as SupabaseErrorShape;
    const parts = [candidate.message, candidate.details, candidate.hint, candidate.code]
      .filter((value) => value !== undefined && value !== null && String(value).trim().length > 0)
      .map((value) => String(value).trim());

    if (parts.length > 0) {
      return parts.join(" — ");
    }
  }

  if (typeof error === "string") {
    return error;
  }

  return fallback;
}

export function isSupabaseSchemaError(error: unknown) {
  const message = extractSupabaseErrorText(error, "").toLowerCase();

  return (
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("column")
  );
}

export function formatSupabaseErrorMessage(error: unknown, fallback = "Supabase request failed.") {
  if (!error) {
    return fallback;
  }

  const message = extractSupabaseErrorText(error, fallback);
  const normalizedMessage = message.toLowerCase();

  if (!hasSupabaseEnv()) {
    return getSupabaseSetupMessage();
  }

  if (isSupabaseSchemaError(error)) {
    return "Supabase tables are not set up yet. Run the SQL from `supabase/schema.sql` in the Supabase SQL Editor, then refresh the app.";
  }

  if (
    normalizedMessage.includes("invalid api key") ||
    normalizedMessage.includes("jwt") ||
    normalizedMessage.includes("apikey")
  ) {
    return "Your Supabase URL or anon key looks invalid. Re-copy them from Supabase Dashboard → Project Settings → API, then restart the dev server.";
  }

  if (normalizedMessage.includes("failed to fetch") || normalizedMessage.includes("networkerror")) {
    return "The browser could not reach Supabase. Check that the project is online, the URL in .env.local is correct, and the app was restarted after saving the file.";
  }

  return message || fallback;
}

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(getSupabaseSetupMessage());
  }

  return createClient(url, anonKey);
}

export function getSupabaseBrowserClient() {
  if (!hasSupabaseEnv()) {
    return null;
  }

  if (!browserClient) {
    browserClient = createSupabaseBrowserClient();
  }

  return browserClient;
}
