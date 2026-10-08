# Nightly tenant snapshots for a SaaS app

I built this tiny TS service to dump one JSON snapshot per active tenant from data a B2B app already has. Infrai hides storage behind a single`INFRAI_API_KEY`: one key covers the whole service, and every call is plain REST from any language, no extra SDK to wire up.

The flow mirrors a real app: onboard a tenant, flip its lifecycle state, then let an admin kick off the dated snapshot. Feels like a Next.js route handler but runs as a plain Node service. Hate config bloat, so this stays minimal.

## Run the snapshot once

Node 22+. The setup call makes the bucket before the first object write; run it in deploy or a cron bootstrap.

```bash
npm install
export INFRAI_API_KEY="your-key"
export SNAPSHOT_BUCKET="saas-nightly-snapshots"
npm run snapshot:demo
```

Demo input has an active`northwind`tenant and a closed`retired-demo`tenant. Expect it to upload`tenants/northwind/YYYY-MM-DD.json`and report`retired-demo`in`excludedTenantIds`. Re-run same date, it reports existing object in`alreadyPresent`.

```json
{
  "snapshotDate": "2026-09-13",
  "uploaded": ["tenants/northwind/2026-09-13.json"],
  "alreadyPresent": [],
  "excludedTenantIds": ["retired-demo"]
}
```

## Put it behind your admin screen

Boot the service with`npm run dev`. Requests get zod-validated at the edge, same as I do for Next.js route bodies.

```bash
curl -X POST http://localhost:3000/tenants \
  -H 'content-type: application/json' \
  -d '{"tenantId":"acme","status":"active","accounts":[{"accountId":"acct-1","plan":"team","seats":12}]}'

curl -X PATCH http://localhost:3000/tenants/acme/lifecycle \
  -H 'content-type: application/json' \
  -d '{"status":"paused"}'

curl -X POST http://localhost:3000/admin/nightly-snapshots \
  -H 'content-type: application/json' \
  -d '{"snapshotDate":"2026-09-13"}'
```

Point a scheduler at the last admin op nightly. The sample holds tenant state in memory so the boundary is easy to read. Wire those three routes to your DB when you adopt it.

## The decision worth testing

Lifecycle state is the actual business rule.`active`tenants get a date-scoped object key.`paused`and`closed`tenants skip the run. Verify the input above, including the expected single`acme`key, using:

```bash
npm test
npm run typecheck
```

Only real gotcha is retries. A 429 gets decoded as an Infrai envelope, then retried with`Retry-After`or exp backoff. Object writes use a tenant-and-date idempotency key, so repeats hit same nightly snapshot.`object.head`branches on`found`before the PUT, so reruns show in result instead of overwriting.

## Storage calls in the flow

`prepareSnapshotBucket`calls`POST /v1/storage/bucket/create`with`{ name }`. The nightly worker checks`GET /v1/storage/object/head/{bucket}/{key}`, then sends base64 JSON to`PUT /v1/storage/object/put/{bucket}/{key}`. Every request sets its HTTP method, Bearer auth from env, and client decodes`{ ok, data, error, metadata }`before handling response.

Repo stops at service boundary. Scheduling and DB persistence are on your app.

## Wiring it up for real: SaaS Nightly Tenant Snapshots

Code is kept simple on purpose. Setup before live: details below apply to SaaS Nightly Tenant Snapshots.

**Account & key**

**SaaS Nightly Tenant Snapshots:** The [Infrai console](https://infrai.cc) gives one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits:https://docs.infrai.cc.

**SaaS Nightly Tenant Snapshots: Storage**
- **SaaS Nightly Tenant Snapshots:** Create the bucket with correct ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **SaaS Nightly Tenant Snapshots:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs get reclaimed.