import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { productionConfig, prepareProduction } from "./production.mts";

test("production config accepts DNS host and preserves streaming and authority",()=>{
 const text=productionConfig("Studio.Example.com");
 assert.match(text,/studio.example.com \{/);assert.match(text,/reverse_proxy 127.0.0.1:3000/);assert.match(text,/header_up Host \{host\}/);assert.match(text,/flush_interval -1/);
 for(const host of ["localhost","a.local","a.localhost","127.0.0.1","https://example.com","example.com:443","example.com/x","*.example.com","evil.com\n}","-bad.example.com","example.com "]) assert.throws(()=>productionConfig(host),/public DNS hostname/);
});
test("preparation writes once without replacing files and host-check refuses local-only",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"production-test-"));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,"Caddyfile");
 const result=await prepareProduction(["--domain","studio.example.com","--output",path]);assert.equal(result.url,"https://studio.example.com");const before=await readFile(path,"utf8");
 await assert.rejects(prepareProduction(["--domain","other.example.com","--output",path]),/EEXIST/);assert.equal(await readFile(path,"utf8"),before);
 const old=process.env.PODFRAMES_LOCAL_ONLY;process.env.PODFRAMES_LOCAL_ONLY="true";try{await assert.rejects(prepareProduction(["--domain","studio.example.com","--output",join(dir,"blocked"),"--check-host"]),/local-only/);}finally{if(old===undefined)delete process.env.PODFRAMES_LOCAL_ONLY;else process.env.PODFRAMES_LOCAL_ONLY=old;}
});
