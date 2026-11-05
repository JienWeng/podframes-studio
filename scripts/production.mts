import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { ensureEnvLoaded } from "../packages/core/src/config.ts";

/** Produce configuration only. Never change the live service, DNS, or credentials. */
export function productionConfig(domain: string): string {
  const host = domain.toLowerCase();
  if (domain !== domain.trim() || host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Supply a public DNS hostname only, such as studio.example.com; no URL, port, IP, wildcard, or path.");
  }
  return `# Prepared configuration only. Review the deployment prerequisites before use.\n# On the target host: PODFRAMES_LOCAL_ONLY=false and a valid PODFRAMES_API_TOKEN.\n# Both web and worker must share the target host's persistent project storage.\n${host} {\n  reverse_proxy 127.0.0.1:3000 {\n    # Keep the public authority for same-origin checks.\n    header_up Host {host}\n    # Stream progress immediately rather than buffering SSE.\n    flush_interval -1\n  }\n}\n`;
}

export async function prepareProduction(args: string[]): Promise<{ path: string; url: string; status: string }> {
  const { values, positionals } = parseArgs({ args, options: { domain: { type: "string" }, output: { type: "string" }, "check-host": { type: "boolean" } }, allowPositionals: true });
  if (positionals.length || !values.domain || !values.output) throw new Error("Usage: pnpm production --domain studio.example.com --output /path/to/Caddyfile");
  const config = productionConfig(values.domain);
  if (values["check-host"]) {
    ensureEnvLoaded(process.cwd());
    if (process.env.PODFRAMES_LOCAL_ONLY === "true") throw new Error("Target host still enables local-only access. Set PODFRAMES_LOCAL_ONLY=false before public hosting.");
    if ((process.env.PODFRAMES_API_TOKEN?.length ?? 0) < 32) throw new Error("Target host needs an owner token of at least 32 characters. No configuration was written.");
  }
  const path = resolve(values.output);
  await writeFile(path, config, { flag: "wx", mode: 0o600 });
  return { path, url: `https://${values.domain.toLowerCase()}`, status: "Prepared only, not live. Before starting Caddy: configure DNS/firewall, install Caddy, set PODFRAMES_LOCAL_ONLY=false and a valid owner token on the target host, build and restart the production services, then validate the Caddyfile. Existing files and live settings were not changed." };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  prepareProduction(process.argv.slice(2)).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
