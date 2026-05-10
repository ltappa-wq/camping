/**
 * Seed dogfood data for Phase 6a:
 *   - 4 ClosedDateRange rows (one current, one upcoming, one off-season,
 *     one overlapping a dogfood reservation so the warning toast fires)
 *   - 1 hero image on the Property (from picsum.photos)
 *   - 5 PropertyImage rows in the gallery
 *   - 3 SiteImage rows on each of the first 3 sites
 *
 * Idempotent — every prior dogfood-tagged row is removed first, then
 * recreated. Identification:
 *   - ClosedDateRange.reason is prefixed "Dogfood:"
 *   - Property/Site image URLs contain "/dogfood/" in their storage path
 *   - Hero image URL contains "/dogfood/hero-"
 *
 * Usage: pnpm tsx scripts/seed-dogfood-phase6a.ts
 *
 * Requires DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * in .env.
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

config();

const SLUG = "monument-point";
const PROPERTY_PHOTOS_BUCKET = "property-photos";
const SITE_PHOTOS_BUCKET = "site-photos";

const prisma = new PrismaClient();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — add to .env first.",
  );
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ONE_DAY_MS = 86_400_000;

function dateOnly(daysFromNow: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + daysFromNow * ONE_DAY_MS);
}

/** Download a JPEG from picsum.photos with a deterministic seed. */
async function fetchPicsum(seed: string, width = 1600, height = 1000) {
  const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`picsum fetch failed for ${seed}: ${res.status}`);
  }
  const buffer = new Uint8Array(await res.arrayBuffer());
  return buffer;
}

async function uploadDogfoodPhoto(args: {
  bucket: string;
  path: string;
  bytes: Uint8Array;
}) {
  const { error } = await supabase.storage
    .from(args.bucket)
    .upload(args.path, args.bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (error) {
    throw new Error(`upload ${args.bucket}/${args.path}: ${error.message}`);
  }
  const { data } = supabase.storage.from(args.bucket).getPublicUrl(args.path);
  return data.publicUrl;
}

async function deleteDogfoodObjectsInBucket(bucket: string, prefix: string) {
  // Recurse one level deep — handles `{propertyId}/dogfood/*` and
  // `{propertyId}/{siteId}/dogfood/*`.
  async function listAll(path: string): Promise<string[]> {
    const { data, error } = await supabase.storage.from(bucket).list(path, {
      limit: 1000,
    });
    if (error) {
      // Empty path returns no error; missing folders just return [].
      return [];
    }
    const out: string[] = [];
    for (const item of data ?? []) {
      const fullPath = path ? `${path}/${item.name}` : item.name;
      if (item.id == null) {
        // Folder — recurse
        const nested = await listAll(fullPath);
        out.push(...nested);
      } else if (fullPath.includes(prefix)) {
        out.push(fullPath);
      }
    }
    return out;
  }
  const paths = await listAll("");
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) {
    console.warn(`cleanup ${bucket}: ${error.message}`);
  } else {
    console.log(`  removed ${paths.length} prior object(s) from ${bucket}`);
  }
}

async function main() {
  const property = await prisma.property.findUnique({
    where: { slug: SLUG },
  });
  if (!property) {
    console.error(`Property '${SLUG}' not found. Run pnpm db:seed first.`);
    process.exit(1);
  }

  const sites = await prisma.site.findMany({
    where: { propertyId: property.id, deletedAt: null },
    orderBy: { label: "asc" },
    take: 3,
  });
  if (sites.length === 0) {
    console.error(
      "No sites found. Run pnpm db:seed (and the wizard) before re-running.",
    );
    process.exit(1);
  }

  console.log(`Seeding Phase 6a dogfood for ${property.name}…`);

  // ===========================================================================
  // 1. Reset any prior dogfood data
  // ===========================================================================
  console.log("Cleaning up prior dogfood data…");
  await prisma.closedDateRange.deleteMany({
    where: {
      propertyId: property.id,
      reason: { startsWith: "Dogfood:" },
    },
  });
  await prisma.propertyImage.deleteMany({
    where: {
      propertyId: property.id,
      url: { contains: "/dogfood/" },
    },
  });
  await prisma.siteImage.deleteMany({
    where: {
      site: { propertyId: property.id },
      url: { contains: "/dogfood/" },
    },
  });
  // Reset hero only if it points at a previous dogfood upload.
  if (property.heroImageUrl?.includes("/dogfood/hero-")) {
    await prisma.property.update({
      where: { id: property.id },
      data: { heroImageUrl: null },
    });
  }
  await deleteDogfoodObjectsInBucket(PROPERTY_PHOTOS_BUCKET, "/dogfood/");
  await deleteDogfoodObjectsInBucket(SITE_PHOTOS_BUCKET, "/dogfood/");

  // ===========================================================================
  // 2. Closed-date ranges
  // ===========================================================================
  console.log("Creating closed-date ranges…");
  const closures = [
    {
      // Single day next week — maintenance
      startDate: dateOnly(7),
      endDate: dateOnly(7),
      reason: "Dogfood: Annual road regrade — site access blocked",
    },
    {
      // 3-day Memorial weekend ~3 weeks out
      startDate: dateOnly(21),
      endDate: dateOnly(23),
      reason: "Dogfood: Owner stay (private use)",
    },
    {
      // Long off-season block in November
      startDate: new Date(
        Date.UTC(new Date().getUTCFullYear(), 10, 1),
      ),
      endDate: new Date(Date.UTC(new Date().getUTCFullYear(), 10, 30)),
      reason: "Dogfood: November shutdown (post-season)",
    },
    {
      // Overlapping a dogfood reservation (DOGFOOD-001 is checked in
      // 2 days ago through 1 day from now)
      startDate: dateOnly(-1),
      endDate: dateOnly(0),
      reason:
        "Dogfood: Overlap test — should warn about existing reservations",
    },
  ];
  for (const c of closures) {
    await prisma.closedDateRange.create({
      data: {
        propertyId: property.id,
        startDate: c.startDate,
        endDate: c.endDate,
        reason: c.reason,
      },
    });
    console.log(
      `  ${c.startDate.toISOString().slice(0, 10)} → ${c.endDate
        .toISOString()
        .slice(0, 10)}  ${c.reason}`,
    );
  }

  // ===========================================================================
  // 3. Hero + property gallery
  // ===========================================================================
  console.log("Uploading hero image…");
  const heroBytes = await fetchPicsum(`mp-hero-${property.id}`, 2400, 800);
  const heroPath = `${property.id}/dogfood/hero-${Date.now()}.jpg`;
  const heroUrl = await uploadDogfoodPhoto({
    bucket: PROPERTY_PHOTOS_BUCKET,
    path: heroPath,
    bytes: heroBytes,
  });
  await prisma.property.update({
    where: { id: property.id },
    data: { heroImageUrl: heroUrl },
  });
  console.log(`  hero: ${heroUrl}`);

  console.log("Uploading property gallery (5 images)…");
  const propertyCaptions = [
    "Sunset over the bluff",
    "Wooded sites have plenty of shade",
    "Lakeshore trail (5-min walk)",
    "Communal fire ring",
    "Star-watching deck",
  ];
  for (let i = 0; i < propertyCaptions.length; i++) {
    const bytes = await fetchPicsum(`mp-prop-${i}-${property.id}`);
    const path = `${property.id}/dogfood/gallery-${i + 1}-${Date.now()}.jpg`;
    const url = await uploadDogfoodPhoto({
      bucket: PROPERTY_PHOTOS_BUCKET,
      path,
      bytes,
    });
    await prisma.propertyImage.create({
      data: {
        propertyId: property.id,
        url,
        caption: propertyCaptions[i],
        order: i,
      },
    });
    console.log(`  ${i + 1}. ${propertyCaptions[i]}`);
  }

  // ===========================================================================
  // 4. Per-site galleries (3 photos × first 3 sites)
  // ===========================================================================
  console.log("Uploading per-site galleries (3 images × 3 sites)…");
  for (const site of sites) {
    for (let i = 0; i < 3; i++) {
      const bytes = await fetchPicsum(
        `mp-site-${site.id}-${i}`,
        1600,
        1200,
      );
      const path = `${property.id}/${site.id}/dogfood/photo-${i + 1}-${Date.now()}.jpg`;
      const url = await uploadDogfoodPhoto({
        bucket: SITE_PHOTOS_BUCKET,
        path,
        bytes,
      });
      await prisma.siteImage.create({
        data: {
          siteId: site.id,
          url,
          caption:
            i === 0
              ? `Site ${site.label} — main view`
              : i === 1
                ? `Site ${site.label} — fire ring`
                : `Site ${site.label} — view from the back`,
          order: i,
        },
      });
    }
    console.log(`  Site ${site.label}: 3 photos`);
  }

  console.log("\n✓ Phase 6a dogfood data seeded.");
  console.log(
    "  4 closed-date ranges, 1 hero, 5 property gallery images, 9 site images.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
