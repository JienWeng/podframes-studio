import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextRequest } from "next/server";
import { createTeamMember, teamMembers, revokeTeamMember, authenticateTeamMember } from "../../../packages/core/src/team";
import { automationAuthorization } from "./api-auth";
import { proxy } from "../proxy";
import * as team from "../app/api/team/route";
const ownerToken="owner-token-for-tests-at-least-thirty-two-characters";
test("shared members enforce roles, revoke immediately, and never inherit local-owner bypass",async t=>{
 const root=await mkdtemp(join(tmpdir(),"podframes-team-"));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(join(root,"pnpm-workspace.yaml"),"packages: []");
 t.mock.method(process,"cwd",()=>root);
 const old={token:process.env.PODFRAMES_API_TOKEN,local:process.env.PODFRAMES_LOCAL_ONLY};process.env.PODFRAMES_API_TOKEN=ownerToken;process.env.PODFRAMES_LOCAL_ONLY="true";
 t.after(()=>{for(const [key,value]of [["PODFRAMES_API_TOKEN",old.token],["PODFRAMES_LOCAL_ONLY",old.local]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value;}});
 const editor=createTeamMember(root,"Editor","editor"),viewer=createTeamMember(root,"Viewer","viewer");
 assert.ok(!JSON.stringify(teamMembers(root)).includes(editor.token));assert.ok(!JSON.stringify(teamMembers(root)).includes("tokenHash"));
 const request=(path:string,token:string,method="GET",basic=false)=>new NextRequest(`http://localhost:3000${path}`,{method,headers:{host:"localhost:3000",authorization:basic?`Basic ${Buffer.from(`${viewer.member.id}:${token}`).toString("base64")}`:`Bearer ${token}`}});
 for(const path of ["/api/generate","/api/voice-preview","/api/library","/api/projects/test"]){
  for(const method of ["POST","PATCH","DELETE"]){assert.equal(proxy(request(path,viewer.token,method)).status,403);assert.equal(proxy(request(path,editor.token,method)).headers.get("x-middleware-next"),"1");}
 }
 assert.equal(proxy(request("/studio",viewer.token,"GET",true)).headers.get("x-middleware-next"),"1");
 assert.equal(proxy(request("/api/team",editor.token)).status,403);
 assert.equal((await team.GET(request("/api/team",viewer.token))).status,403);
 assert.equal(automationAuthorization(request("/api/v1/generate",viewer.token,"POST"),ownerToken,root)?.status,403);
 assert.equal(automationAuthorization(request("/api/v1/generate",editor.token,"POST"),ownerToken,root),null);
 revokeTeamMember(root,viewer.member.id);assert.equal(authenticateTeamMember(root,viewer.token),null);assert.equal(proxy(request("/studio",viewer.token)).status,401);
 assert.equal(proxy(request("/studio","invalid")).status,401);
 const create=await team.POST(new Request("http://localhost:3000/api/team",{method:"POST",headers:{host:"localhost:3000",authorization:`Bearer ${ownerToken}`,"content-type":"application/json"},body:JSON.stringify({name:"Approved member",role:"editor"})}));assert.equal(create.status,201);assert.equal(create.headers.get("cache-control"),"no-store");const created=await create.json();assert.equal(created.token.length,64);
});
