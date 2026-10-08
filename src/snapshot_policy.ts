import { z } from "zod";

export const accountSchema = z.object({
  accountId: z.string().min(1),
  plan: z.string().min(1),
  seats: z.number().int().nonnegative(),
});

export const tenantSchema = z.object({
  tenantId: z.string().regex(/^[a-z0-9-]+$/),
  status: z.enum(["active", "paused", "closed"]),
  accounts: z.array(accountSchema),
});

export type Tenant = z.infer<typeof tenantSchema>;

export type SnapshotCandidate = {
  tenant: Tenant;
  key: string;
  snapshotDate: string;
};

export function chooseNightlySnapshots(tenants: Tenant[], snapshotDate: string): SnapshotCandidate[] {
  return tenants
    .filter((tenant) => tenant.status === "active")
    .map((tenant) => ({
      tenant,
      snapshotDate,
      key: `tenants/${tenant.tenantId}/${snapshotDate}.json`,
    }));
}
