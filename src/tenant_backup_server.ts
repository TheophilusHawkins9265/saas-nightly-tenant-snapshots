import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z, ZodError } from "zod";
import { InfraiError } from "./infrai_storage.js";
import { prepareSnapshotBucket, runNightlySnapshot, type SnapshotResult } from "./nightly_snapshot.js";
import { tenantSchema, type Tenant } from "./snapshot_policy.js";

const bucket = process.env.SNAPSHOT_BUCKET ?? "saas-nightly-snapshots";
const port = Number(process.env.PORT ?? 3000);
const tenants = new Map<string, Tenant>();

const lifecycleSchema = z.object({ status: z.enum(["active", "paused", "closed"]) });
const adminRunSchema = z.object({ snapshotDate: z.string().date() });

async function jsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "POST" && request.url === "/tenants") {
    const tenant = tenantSchema.parse(await jsonBody(request));
    tenants.set(tenant.tenantId, tenant);
    send(response, 201, { tenant });
    return;
  }

  const lifecycleMatch = request.url?.match(/^\/tenants\/([a-z0-9-]+)\/lifecycle$/);
  if (request.method === "PATCH" && lifecycleMatch) {
    const tenant = tenants.get(lifecycleMatch[1]);
    if (!tenant) return send(response, 404, { error: "tenant_not_found" });
    const change = lifecycleSchema.parse(await jsonBody(request));
    const updated = { ...tenant, status: change.status };
    tenants.set(updated.tenantId, updated);
    send(response, 200, { tenant: updated });
    return;
  }

  if (request.method === "POST" && request.url === "/admin/nightly-snapshots") {
    const { snapshotDate } = adminRunSchema.parse(await jsonBody(request));
    const result: SnapshotResult = await runNightlySnapshot(bucket, snapshotDate, [...tenants.values()]);
    send(response, 200, result);
    return;
  }

  send(response, 404, { error: "route_not_found" });
}

await prepareSnapshotBucket(bucket);

const server = createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    if (error instanceof ZodError) return send(response, 400, { error: "invalid_request", issues: error.issues });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { error: error.code, message: error.message });
    }
    send(response, 500, { error: "snapshot_failed" });
  });
});

server.listen(port, () => console.log(`Tenant backup service listening on http://localhost:${port}`));
