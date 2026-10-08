import { infrai } from "./infrai_storage.js";
import { chooseNightlySnapshots, type Tenant } from "./snapshot_policy.js";

export type SnapshotResult = {
  snapshotDate: string;
  uploaded: string[];
  alreadyPresent: string[];
  excludedTenantIds: string[];
};

export async function prepareSnapshotBucket(bucket: string): Promise<void> {
  await infrai.storage.bucket.create(bucket);
}

export async function runNightlySnapshot(
  bucket: string,
  snapshotDate: string,
  tenants: Tenant[],
): Promise<SnapshotResult> {
  const candidates = chooseNightlySnapshots(tenants, snapshotDate);
  const activeIds = new Set(candidates.map(({ tenant }) => tenant.tenantId));
  const result: SnapshotResult = {
    snapshotDate,
    uploaded: [],
    alreadyPresent: [],
    excludedTenantIds: tenants.filter((tenant) => !activeIds.has(tenant.tenantId)).map((tenant) => tenant.tenantId),
  };

  for (const candidate of candidates) {
    const existing = await infrai.storage.object.head(bucket, candidate.key);
    if (existing.found) {
      result.alreadyPresent.push(candidate.key);
      continue;
    }

    const document = JSON.stringify({
      schemaVersion: 1,
      snapshotDate: candidate.snapshotDate,
      tenant: candidate.tenant,
    });
    const idempotencyKey = `nightly:${candidate.tenant.tenantId}:${snapshotDate}`;
    await infrai.storage.object.put(bucket, candidate.key, Buffer.from(document).toString("base64"), idempotencyKey);
    result.uploaded.push(candidate.key);
  }
  return result;
}
