/**
 * One-time setup: creates the Supabase Storage buckets used by the app.
 *
 * Buckets:
 *   - property-maps   (Phase 1)  — campground map images, 5 MB cap
 *   - property-photos (Phase 6a) — hero image + property gallery, 10 MB cap
 *   - site-photos     (Phase 6a) — per-site galleries, 10 MB cap
 *
 * All three are public-read so guests viewing /p/[slug] can render images
 * without auth; uploads/deletes are restricted to server-side code that
 * holds the service role key. Idempotent — safe to run repeatedly.
 *
 * Run with: pnpm setup:storage
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"];

type BucketSpec = {
  name: string;
  fileSizeLimitMB: number;
};

const BUCKETS: BucketSpec[] = [
  { name: "property-maps", fileSizeLimitMB: 5 },
  { name: "property-photos", fileSizeLimitMB: 10 },
  { name: "site-photos", fileSizeLimitMB: 10 },
];

async function ensureBucket(
  supabase: SupabaseClient,
  spec: BucketSpec,
): Promise<void> {
  const { data: existing, error: listError } =
    await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Failed to list buckets: ${listError.message}`);
  }

  const limit = spec.fileSizeLimitMB * 1024 * 1024;
  const found = existing?.find((b) => b.name === spec.name);

  if (found) {
    console.log(
      `✓ Bucket '${spec.name}' already exists (public=${found.public}).`,
    );
    if (!found.public) {
      const { error } = await supabase.storage.updateBucket(spec.name, {
        public: true,
        fileSizeLimit: limit,
        allowedMimeTypes: ALLOWED_MIME,
      });
      if (error) {
        throw new Error(
          `Failed to update '${spec.name}' to public: ${error.message}`,
        );
      }
      console.log(`  → Updated to public.`);
    }
    return;
  }

  const { error } = await supabase.storage.createBucket(spec.name, {
    public: true,
    fileSizeLimit: limit,
    allowedMimeTypes: ALLOWED_MIME,
  });
  if (error) {
    throw new Error(`Failed to create '${spec.name}': ${error.message}`);
  }
  console.log(
    `✓ Created public bucket '${spec.name}' (${spec.fileSizeLimitMB}MB cap, png/jpg/webp).`,
  );
}

async function main() {
  const supabase = createClient(URL!, KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const spec of BUCKETS) {
    await ensureBucket(supabase, spec);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
