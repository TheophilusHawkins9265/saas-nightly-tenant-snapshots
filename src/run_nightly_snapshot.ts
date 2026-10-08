import { prepareSnapshotBucket, runNightlySnapshot } from "./nightly_snapshot.js";
import { tenantSchema } from "./snapshot_policy.js";

const bucket = process.env.SNAPSHOT_BUCKET ?? "saas-nightly-snapshots";
const snapshotDate = new Date().toISOString().slice(0, 10);
const tenants = [
  tenantSchema.parse({
    tenantId: "northwind",
    status: "active",
    accounts: [{ accountId: "acct-104", plan: "team", seats: 18 }],
  }),
  tenantSchema.parse({
    tenantId: "retired-demo",
    status: "closed",
    accounts: [{ accountId: "acct-219", plan: "starter", seats: 2 }],
  }),
];

await prepareSnapshotBucket(bucket);
const result = await runNightlySnapshot(bucket, snapshotDate, tenants);
console.log(JSON.stringify(result, null, 2));
