import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// Models that have a direct `propertyId` column. Queries against these models
// from a scoped client are auto-filtered (and writes auto-tagged) by propertyId.
const SCOPED_MODELS = new Set<string>([
  "Site",
  "SiteType",
  "RatePlan",
  "RateModifier",
  "TaxRate",
  "Addon",
  "ClosedDateRange",
  "Guest",
  "Reservation",
  "EmailTemplate",
  "EmailLog",
  "GuestMagicLink",
]);

const READ_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);

const WRITE_WHERE_OPS = new Set([
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

const CREATE_OPS = new Set(["create", "createMany"]);

/**
 * Returns a Prisma client that auto-scopes queries on tenant-owned models to
 * the given propertyId. Reads inject `where: { propertyId }`, creates inject
 * `data: { propertyId }`. Use this in Server Actions instead of the bare
 * client to avoid scattering `where: { propertyId }` boilerplate.
 *
 * Models without a direct `propertyId` column (Payment, ReservationLineItem,
 * Account, Session, User, OperatorUser, Organization, Property itself) pass
 * through unmodified — scope those manually via their parent relation.
 *
 * `findUnique` on a single-column unique key will be rejected by Prisma if you
 * add propertyId — for those queries, use `findFirst` instead.
 */
export function scopedPrisma(propertyId: string) {
  return prisma.$extends({
    name: "property-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const a = args as any;

          if (READ_OPS.has(operation) || WRITE_WHERE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), propertyId };
          }

          if (CREATE_OPS.has(operation)) {
            if (operation === "createMany") {
              const rows = Array.isArray(a.data) ? a.data : [a.data];
              a.data = rows.map((row: Record<string, unknown>) => ({
                ...row,
                propertyId,
              }));
            } else {
              a.data = { ...(a.data ?? {}), propertyId };
            }
          }

          if (operation === "upsert") {
            a.create = { ...(a.create ?? {}), propertyId };
          }

          return query(a);
        },
      },
    },
  });
}

export type ScopedPrisma = ReturnType<typeof scopedPrisma>;

// Re-export Prisma namespace for convenience in callers that need types.
export { Prisma };
