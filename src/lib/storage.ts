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
export const PROPERTY_PHOTOS_BUCKET = "property-photos";
export const SITE_PHOTOS_BUCKET = "site-photos";

const MAP_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export type PropertyMapUpload = {
  propertyId: string;
  filename: string;
  contentType: string;
  bytes: ArrayBuffer | Buffer | Uint8Array;
};

function toBytes(
  bytes: ArrayBuffer | Buffer | Uint8Array,
): Uint8Array | Buffer {
  return bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

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

  const data = toBytes(upload.bytes);
  if (data.byteLength > MAP_MAX_BYTES) {
    throw new Error("Map image exceeds 5MB limit");
  }

  const path = `${upload.propertyId}/${Date.now()}-${safeFilename(upload.filename)}`;

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

// =============================================================================
// Phase 6a: property + site photo uploads
// =============================================================================

export type PropertyPhotoUpload = {
  propertyId: string;
  filename: string;
  contentType: string;
  bytes: ArrayBuffer | Buffer | Uint8Array;
};

export type SitePhotoUpload = {
  propertyId: string;
  siteId: string;
  filename: string;
  contentType: string;
  bytes: ArrayBuffer | Buffer | Uint8Array;
};

/**
 * Uploads a hero or gallery image to the property-photos bucket. 10MB cap;
 * png/jpg/webp only. Returns the public URL the caller stores on
 * Property.heroImageUrl or PropertyImage.url.
 */
export async function uploadPropertyPhoto(
  upload: PropertyPhotoUpload,
): Promise<{ publicUrl: string; path: string }> {
  if (!ALLOWED_MIME.has(upload.contentType)) {
    throw new Error(
      `Unsupported photo type: ${upload.contentType}. Use PNG, JPG, or WebP.`,
    );
  }
  const data = toBytes(upload.bytes);
  if (data.byteLength > PHOTO_MAX_BYTES) {
    throw new Error("Photo exceeds 10MB limit");
  }

  const path = `${upload.propertyId}/${Date.now()}-${safeFilename(upload.filename)}`;

  const client = getSupabaseAdmin();
  const { error } = await client.storage
    .from(PROPERTY_PHOTOS_BUCKET)
    .upload(path, data, {
      contentType: upload.contentType,
      upsert: false,
    });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: pub } = client.storage
    .from(PROPERTY_PHOTOS_BUCKET)
    .getPublicUrl(path);
  return { publicUrl: pub.publicUrl, path };
}

export async function deletePropertyPhotoByUrl(
  publicUrl: string,
): Promise<void> {
  const marker = `/storage/v1/object/public/${PROPERTY_PHOTOS_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = publicUrl.slice(idx + marker.length);
  if (!path) return;
  await getSupabaseAdmin().storage.from(PROPERTY_PHOTOS_BUCKET).remove([path]);
}

/**
 * Uploads a per-site photo to the site-photos bucket. Same constraints as
 * property photos. Path includes both propertyId and siteId for clean
 * cleanup if a site is hard-deleted (not common — sites soft-delete).
 */
export async function uploadSitePhoto(
  upload: SitePhotoUpload,
): Promise<{ publicUrl: string; path: string }> {
  if (!ALLOWED_MIME.has(upload.contentType)) {
    throw new Error(
      `Unsupported photo type: ${upload.contentType}. Use PNG, JPG, or WebP.`,
    );
  }
  const data = toBytes(upload.bytes);
  if (data.byteLength > PHOTO_MAX_BYTES) {
    throw new Error("Photo exceeds 10MB limit");
  }

  const path = `${upload.propertyId}/${upload.siteId}/${Date.now()}-${safeFilename(upload.filename)}`;

  const client = getSupabaseAdmin();
  const { error } = await client.storage
    .from(SITE_PHOTOS_BUCKET)
    .upload(path, data, {
      contentType: upload.contentType,
      upsert: false,
    });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: pub } = client.storage
    .from(SITE_PHOTOS_BUCKET)
    .getPublicUrl(path);
  return { publicUrl: pub.publicUrl, path };
}

export async function deleteSitePhotoByUrl(publicUrl: string): Promise<void> {
  const marker = `/storage/v1/object/public/${SITE_PHOTOS_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = publicUrl.slice(idx + marker.length);
  if (!path) return;
  await getSupabaseAdmin().storage.from(SITE_PHOTOS_BUCKET).remove([path]);
}
