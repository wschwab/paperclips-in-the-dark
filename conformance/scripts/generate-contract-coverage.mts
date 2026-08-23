import fs from "node:fs";
import path from "node:path";
import { getEndpointSchemaMap } from "../src/endpoint-schema-map.js";

const outIndex = process.argv.indexOf("--out");
if (outIndex === -1 || !process.argv[outIndex + 1]) {
  throw new Error("usage: generate-contract-coverage.mts --out <path>");
}

const rows = Object.values(getEndpointSchemaMap())
  .flatMap((operation) =>
    Object.entries(operation.responses).map(([status, disposition]) => ({
      operationId: operation.operationId,
      method: operation.method,
      path: operation.path,
      status,
      kind: disposition.kind,
      ...(disposition.kind === "schema"
        ? { schemaName: disposition.schemaName, collection: disposition.collection }
        : {}),
    })),
  )
  .sort((left, right) =>
    `${left.operationId}\u0000${left.status}`.localeCompare(`${right.operationId}\u0000${right.status}`),
  );

const outputPath = path.resolve(process.argv[outIndex + 1]);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({ rows }, null, 2)}\n`);
