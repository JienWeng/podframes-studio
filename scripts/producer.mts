import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Project, automationJobs, enqueueAutomation, workerOnline, withProjectLock } from "../packages/core/src/index.ts";

export async function reviewHash(project: Project): Promise<string> {
  const state = project.state;
  const hash = createHash("sha256").update(JSON.stringify({ config: state.config, options: state.options, script: state.script, uploads: state.uploads }));
  for (const [id, path] of Object.entries(state.uploads ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(id).update(await readFile(project.abs(path)));
  }
  return hash.digest("hex");
}

export async function producer(args: string[], root: string): Promise<unknown> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    slug: { type: "string" }, to: { type: "string" }, approve: { type: "string" },
    "acknowledge-interrupted": { type: "boolean" },
  } });
  const command = positionals[0];
  if (positionals.length !== 1 || !["discover", "status", "queue"].includes(command ?? "")) throw new Error("Usage: pnpm producer discover | status --slug SLUG | queue --slug SLUG --to script|render [--approve REVIEW_HASH] [--acknowledge-interrupted]");
  if (command === "discover") {
    async function records(folder: string) {
      const names = await readdir(resolve(root, folder)).catch((error) => { if (error.code === "ENOENT") return []; throw error; });
      return Promise.all(names.filter(name => name.endsWith(".json")).sort().map(async name => JSON.parse(await readFile(resolve(root, folder, name), "utf8"))));
    }
    return { workerOnline: workerOnline(root), cast: await records("library/cast"), series: await records("library/series"), projects: await readdir(resolve(root, "projects")).catch(() => []), next: "Create/import an episode with Studio or the existing podframes CLI, then run producer status --slug SLUG before queueing." };
  }
  const slug = values.slug;
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Supply a valid --slug using lowercase letters, numbers and hyphens.");
  return withProjectLock(slug, async () => {
    const project = await Project.load(root, slug);
    if (!project) throw new Error("Project not found. Create/import it first.");
    const hash = await reviewHash(project);
    if (command === "status") return { slug, reviewHash: hash, config: project.state.config, options: project.state.options, script: project.state.script, stages: project.state.stages, output: project.state.output, workerOnline: workerOnline(root), job: automationJobs(root).findLast(job => job.slug === slug) ?? null };
    if (!["script", "render"].includes(values.to ?? "")) throw new Error("Choose --to script (draft only) or --to render (approved generation).");
    if (values.to === "render" && (!project.state.script || values.approve !== hash)) throw new Error("Review the current script, cast and settings with producer status. Full generation requires --approve with its exact reviewHash; changed inputs require renewed approval.");
    const options = values.to === "script" ? { only: "script" as const } : { to: "render" as const };
    const job = enqueueAutomation(root, slug, options, values["acknowledge-interrupted"] ?? false);
    return { jobId: job.id, slug, status: job.status, to: values.to, reviewHash: hash, workerOnline: workerOnline(root), note: "Queued for the existing worker. This command does not generate directly. Drafting may use the configured writing provider allowance." };
  }, root);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  producer(process.argv.slice(2), resolve(import.meta.dirname, "..")).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
