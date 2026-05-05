import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client. Uses the service-role key, which bypasses RLS,
// so this MUST NEVER be imported from a client component or shipped to the
// browser bundle. All uploads/deletes go through Server Actions (or a Route
// Handler) that runs on the server.

if (typeof window !== "undefined") {
  throw new Error("src/lib/storage.ts must not be imported in client code");
}

let _client: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export const PROPERTY_MAPS_BUCKET = "property-maps";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export type PropertyMapUpload = {
  propertyId: string;
  filename: string;
  contentType: string;
  bytes: ArrayBuffer | Buffer | Uint8Array;
};

/**
 * Uploads a property map image to Supabase Storage and returns its public URL.
 * Caps size at 5MB; rejects any non-png/jpg/webp upload.
 */
export async function uploadPropertyMap(
  upload: PropertyMapUpload,
): Promise<{ publicUrl: string; path: string }> {
  if (!ALLOWED_MIME.has(upload.contentType)) {
    throw new Error(
      `Unsupported map image type: ${upload.contentType}. Use PNG, JPG, or WebP.`,
    );
  }

  const data: Uint8Array | Buffer =
    upload.bytes instanceof ArrayBuffer
      ? new Uint8Array(upload.bytes)
      : upload.bytes;
  if (data.byteLength > MAX_BYTES) {
    throw new Error("Map image exceeds 5MB limit");
  }

  const safeName = upload.filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = `${upload.propertyId}/${Date.now()}-${safeName}`;

  const client = getSupabaseAdmin();
  const { error } = await client.storage
    .from(PROPERTY_MAPS_BUCKET)
    .upload(path, data, {
      contentType: upload.contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: pub } = client.storage
    .from(PROPERTY_MAPS_BUCKET)
    .getPublicUrl(path);

  return { publicUrl: pub.publicUrl, path };
}

/**
 * Deletes an object by its full public URL. No-ops if the URL doesn't belong
 * to the property-maps bucket (defensive against stale references).
 */
export async function deletePropertyMapByUrl(publicUrl: string): Promise<void> {
  const marker = `/storage/v1/object/public/${PROPERTY_MAPS_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = publicUrl.slice(idx + marker.length);
  if (!path) return;
  await getSupabaseAdmin().storage.from(PROPERTY_MAPS_BUCKET).remove([path]);
}
