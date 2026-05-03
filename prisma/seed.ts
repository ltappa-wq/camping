import { PrismaClient, ChargeUnit, OperatorRole } from "@prisma/client";

const prisma = new PrismaClient();

const OWNER_EMAIL = "rvthereyetwi@gmail.com";

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "seed-org-monument-point" },
    update: {},
    create: {
      id: "seed-org-monument-point",
      name: "Monument Point Camping LLC",
    },
  });

  await prisma.operatorUser.upsert({
    where: { email: OWNER_EMAIL },
    update: { organizationId: org.id, role: OperatorRole.OWNER },
    create: {
      organizationId: org.id,
      email: OWNER_EMAIL,
      name: "Monument Point Owner",
      role: OperatorRole.OWNER,
    },
  });

  const property = await prisma.property.upsert({
    where: { slug: "monument-point" },
    update: {},
    create: {
      organizationId: org.id,
      slug: "monument-point",
      name: "Monument Point Camping",
      city: "Sister Bay",
      state: "WI",
      checkInTime: "14:00",
      checkOutTime: "11:00",
      seasonStartMonth: 5,
      seasonStartDay: 1,
      seasonEndMonth: 10,
      seasonEndDay: 15,
      cancelFullRefundDays: 14,
      cancelPartialRefundDays: 7,
      cancelPartialRefundPct: 50,
    },
  });

  // Site type. We don't have a natural unique key, so look up first.
  let siteType = await prisma.siteType.findFirst({
    where: { propertyId: property.id, name: "Wooded Electric Site" },
  });
  if (!siteType) {
    siteType = await prisma.siteType.create({
      data: {
        propertyId: property.id,
        name: "Wooded Electric Site",
        description: "Wooded site with 30A electric. RVs only — no tents.",
        electricAmps: 30,
        hasWater: false,
        hasSewer: false,
        maxAdults: 2,
        maxChildren: 4,
        petsAllowed: true,
        tentsAllowed: false,
      },
    });
  }

  // 35 sites labeled "1" through "35" — placeholder until operator confirms numbering.
  for (let i = 1; i <= 35; i++) {
    await prisma.site.upsert({
      where: {
        propertyId_label: { propertyId: property.id, label: String(i) },
      },
      update: {},
      create: {
        propertyId: property.id,
        siteTypeId: siteType.id,
        label: String(i),
      },
    });
  }

  // Rate plans — look up by name within property since no unique constraint.
  const existingNightly = await prisma.ratePlan.findFirst({
    where: { propertyId: property.id, name: "Nightly" },
  });
  if (!existingNightly) {
    await prisma.ratePlan.create({
      data: {
        propertyId: property.id,
        name: "Nightly",
        chargeUnit: ChargeUnit.NIGHT,
        pricePerUnitCents: 4000, // $40
        minStayDays: 1,
        priority: 0,
      },
    });
  }

  const existingSeasonal = await prisma.ratePlan.findFirst({
    where: { propertyId: property.id, name: "Annual Seasonal" },
  });
  if (!existingSeasonal) {
    await prisma.ratePlan.create({
      data: {
        propertyId: property.id,
        name: "Annual Seasonal",
        chargeUnit: ChargeUnit.SEASON,
        pricePerUnitCents: 200000, // $2000
        minStayDays: 150,
        priority: 100,
      },
    });
  }

  // Addon
  const existingAddon = await prisma.addon.findFirst({
    where: { propertyId: property.id, name: "Firewood Bundle" },
  });
  if (!existingAddon) {
    await prisma.addon.create({
      data: {
        propertyId: property.id,
        name: "Firewood Bundle",
        priceCents: 800, // $8 placeholder
      },
    });
  }

  console.log("Seed complete:");
  console.log(`  Org:       ${org.name} (${org.id})`);
  console.log(`  Owner:     ${OWNER_EMAIL}`);
  console.log(`  Property:  ${property.name} (slug: ${property.slug})`);
  console.log(`  SiteType:  ${siteType.name}`);
  console.log(`  Sites:     35 (labels 1–35)`);
  console.log(`  RatePlans: Nightly $40, Annual Seasonal $2000`);
  console.log(`  Addon:     Firewood Bundle $8`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
