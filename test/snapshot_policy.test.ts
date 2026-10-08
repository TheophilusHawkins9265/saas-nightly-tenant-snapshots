import assert from "node:assert/strict";
import test from "node:test";
import { chooseNightlySnapshots, type Tenant } from "../src/snapshot_policy.js";

test("the nightly run selects active tenants and gives each a date-scoped key", () => {
  const tenants: Tenant[] = [
    { tenantId: "acme", status: "active", accounts: [{ accountId: "a-1", plan: "team", seats: 12 }] },
    { tenantId: "paused-co", status: "paused", accounts: [{ accountId: "a-2", plan: "team", seats: 4 }] },
    { tenantId: "closed-co", status: "closed", accounts: [] },
  ];

  const selected = chooseNightlySnapshots(tenants, "2026-09-13");

  assert.deepEqual(selected.map(({ key }) => key), ["tenants/acme/2026-09-13.json"]);
});
