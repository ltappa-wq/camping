/**
 * One-time setup: creates the `property-maps` Storage bucket in Supabase.
 *
 * Public read (so guests viewing /p/[slug] can render the map without auth);
 * uploads/deletes are restricted to server-side code that holds the service
 * role key. Idempotent — safe to run repeatedly.
 *
 * Run with: pnpm tsx scripts/setup-supabase-storage.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config(); // load .env

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}
if (!KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const BUCKET = "property-maps";

async function main() {
  const supabase = createClient(URL!, KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing, error: listError } =
    await supabase.storage.listBuckets();
  if (listError) {
    console.error("Failed to list buckets:", listError.message);
    process.exit(1);
  }

  const found = existing?.find((b) => b.name === BUCKET);
  if (found) {
    console.log(`✓ Bucket '${BUCKET}' already exists (public=${found.public}).`);
    if (!found.public) {
      const { error: updateError } = await supabase.storage.updateBucket(
        BUCKET,
        {
          public: true,
          fileSizeLimit: 5 * 1024 * 1024,
          allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
        },
      );
      if (updateError) {
        console.error("Failed to update bucket to public:", updateError.message);
        process.exit(1);
      }
      console.log(`  → Updated to public.`);
    }
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });
  if (createError) {
    console.error("Failed to create bucket:", createError.message);
    process.exit(1);
  }

  console.log(`✓ Created public bucket '${BUCKET}' (5MB cap, png/jpg/webp).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
