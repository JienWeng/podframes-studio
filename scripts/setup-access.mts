import { randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureEnvLoaded } from "../packages/core/src/config.ts";

ensureEnvLoaded(process.cwd());
const existing = process.env.PODFRAMES_API_TOKEN;
if (existing !== undefined) {
  if (existing.length < 32) {
    console.error("Existing owner token is too short. Replace it explicitly in .env.local with at least 32 random characters. No settings changed.");
    process.exit(1);
  }
  console.log("Owner access is already configured. Existing credential preserved.");
} else {
  const file = ".env.local";
  const entry = `PODFRAMES_API_TOKEN=${randomBytes(32).toString("hex")}\n`;
  if (existsSync(file)) {
    const content = readFileSync(file, "utf8");
    appendFileSync(file, `${content && !content.endsWith("\n") ? "\n" : ""}${entry}`);
  } else {
    writeFileSync(file, entry, { flag: "wx", mode: 0o600 });
  }
  chmodSync(file, 0o600);
  console.log("Owner access saved privately in .env.local. Browser username: podframes. Read the password locally from that file; it is not printed here. Restart services while idle to apply it.");
}
