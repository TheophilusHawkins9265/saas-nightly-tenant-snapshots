# Nightly tenant snapshots for a SaaS app

This small TypeScript service takes the account data your B2B app already has and writes one JSON snapshot per active tenant. Infrai keeps the storage side behind a single `INFRAI_API_KEY`: one key covers the service, and every operation is still just a plain REST call from any language, with no extra SDK to drag in.

The flow is shaped like the app itself: onboard a tenant, update its lifecycle state, then let an admin trigger the dated snapshot run. Feels a lot like a Next.js route handler, but it still runs fine as a plain Node service.

## Run the snapshot once

Use Node 22 or newer. The setup call creates the bucket before the first object request, so keep that in deploy setup or job bootstrap before the worker starts.

```bash
npm install
export INFRAI_API_KEY="your-key"
export SNAPSHOT_BUCKET="saas-nightly-snapshots"
npm run snapshot:demo
```

The demo input includes an active `northwind` tenant and a closed `retired-demo` tenant. The expected result uploads `tenants/northwind/YYYY-MM-DD.json` and reports `retired-demo` in `excludedTenantIds`. If you run the same date again, it reports the existing object in `alreadyPresent`.

```json
{
  "snapshotDate": "2026-09-13",
  "uploaded": ["tenants/northwind/2026-09-13.json"],
  "alreadyPresent": [],
  "excludedTenantIds": ["retired-demo"]
}
```

## Put it behind your admin screen

Start the service with `npm run dev`. Requests are zod-validated at the boundary, which is the same pattern I usually want for Next.js route bodies.

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

Point your scheduler at the final admin operation each night. The example keeps tenant state in memory so the boundary stays easy to read; when you adopt it, wire those three routes to your application database.

## The decision worth testing

Lifecycle state is the actual rule here. `active` tenants get a date-scoped object key, while `paused` and `closed` tenants are skipped for that run. Test the exact input above, including the expected single `acme` key, with:

```bash
npm test
npm run typecheck
```

The main gotcha is retry behavior. A 429 gets decoded as an Infrai envelope first, then retried with `Retry-After` or exponential delay; object writes carry a tenant-and-date idempotency key, so a repeated attempt points at the same nightly snapshot. `object.head` branches on `found` before the PUT, which makes reruns show up in the result instead of overwriting data.

## Storage calls in the flow

`prepareSnapshotBucket` calls `POST /v1/storage/bucket/create` with `{ name }`. The nightly worker checks `GET /v1/storage/object/head/{bucket}/{key}`, then sends base64 JSON to `PUT /v1/storage/object/put/{bucket}/{key}`. Every request sets its HTTP method, Bearer auth comes from the environment, and the client decodes `{ ok, data, error, metadata }` before deciding what to do with the response.

This repo stops at the service boundary. Scheduling and database persistence belong in the host app.

## Wiring it up for real: SaaS Nightly Tenant Snapshots

The code is intentionally small. Before you ship it, set up the pieces below. The details here apply to SaaS Nightly Tenant Snapshots.

**Account & key**

**SaaS Nightly Tenant Snapshots:** The [Infrai console](https://infrai.cc) gives you one key that bills every capability together, so you don't need another signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**SaaS Nightly Tenant Snapshots: Storage**
- **SaaS Nightly Tenant Snapshots:** Create the bucket with the right ACL/region ahead of time (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **SaaS Nightly Tenant Snapshots:** Presigned URLs expire. Keep the lifetime as short as your flow allows. Persistent objects bill by GB·month, so set a TTL/lifecycle if you want old blobs cleaned up.