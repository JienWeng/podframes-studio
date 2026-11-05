import { accessSync, constants, existsSync, statSync } from "node:fs";
import { ensureEnvLoaded } from "../packages/core/src/config.ts";

ensureEnvLoaded(process.cwd());
const errors: string[] = [];
const [major, minor] = process.versions.node.split(".").map(Number);
if (major! < 22 || (major === 22 && minor! < 13)) errors.push("Node 22.13 or newer is required. Run bash scripts/setup.sh to install supported dependencies.");
for (const directory of [".", "projects", "library", ".automation"]) {
  if (!existsSync(directory)) continue;
  try {
    if (!statSync(directory).isDirectory()) throw new Error("not a directory");
    accessSync(directory, constants.R_OK | constants.W_OK | constants.X_OK);
  } catch {
    errors.push(`Data location ${directory} must be a readable, writable directory owned by the service account.`);
  }
}
if ((process.env.PODFRAMES_API_TOKEN?.length ?? 0) < 32) {
  errors.push("Owner access is missing or invalid. Run bash scripts/setup.sh access to create a missing token, or repair an existing token in .env.local (see docs/SETUP.md).");
}
if (!existsSync("apps/web/.next/BUILD_ID")) {
  errors.push("The production Studio build is missing. Run pnpm build:web before starting services.");
}
if (errors.length) {
  for (const error of errors) console.error(`Podframes setup: ${error}`);
  process.exit(1);
}
