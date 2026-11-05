import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Project, DEFAULT_HOSTS, automationJobs } from "../packages/core/src/index.ts";
import { producer, reviewHash } from "./producer.mts";

test("producer validates review and queues once without invoking generation", async t => {
 const root=await mkdtemp(join(tmpdir(),"producer-test-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const project=await Project.create({topic:"Test",hosts:structuredClone(DEFAULT_HOSTS)},root,"review-test");
 project.state.script={title:"Test",hook:"",turns:[{index:0,hostId:DEFAULT_HOSTS[0]!.id,speaker:DEFAULT_HOSTS[0]!.speaker,text:"Hello"}]};await project.save();
 const hash=await reviewHash(project);
 await assert.rejects(producer(["queue","--slug","review-test","--to","render"],root),/requires --approve/);
 await assert.rejects(producer(["queue","--slug","..","--to","script"],root),/valid --slug/);
 await assert.rejects(producer(["queue","--slug","review-test","--to","wrong"],root),/Choose --to/);
 project.state.config.hosts[0]!.speechSpeed=1.25;await project.save();
 await assert.rejects(producer(["queue","--slug","review-test","--to","render","--approve",hash],root),/renewed approval/);
 assert.equal(automationJobs(root).length,0);
 await producer(["queue","--slug","review-test","--to","render","--approve",await reviewHash(project)],root);
 assert.equal(automationJobs(root).length,1);
 await assert.rejects(producer(["queue","--slug","review-test","--to","render","--approve",await reviewHash(project)],root),/already queued/);
 assert.equal(automationJobs(root).length,1);
});

test("review hashes uploaded portrait bytes but ignores downstream exports",async t=>{
 const root=await mkdtemp(join(tmpdir(),"producer-test-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const project=await Project.create({topic:"Test",hosts:structuredClone(DEFAULT_HOSTS)},root,"portrait-test");
 await mkdir(project.abs("stills"),{recursive:true});await writeFile(project.abs("stills/portrait.png"),"first");project.state.uploads={[DEFAULT_HOSTS[0]!.id]:"stills/portrait.png"};
 const first=await reviewHash(project);project.state.output={videoPath:"output.mp4",durationSec:10,bytes:10};assert.equal(await reviewHash(project),first);
 await writeFile(project.abs("stills/portrait.png"),"changed");assert.notEqual(await reviewHash(project),first);
});
