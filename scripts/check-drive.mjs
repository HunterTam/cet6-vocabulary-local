import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";

const directory = await mkdtemp(join(tmpdir(),"cet6-test-"));
const isWindows = process.platform === "win32";
const mock = join(directory, isWindows ? "rclone-mock.cjs" : "rclone");
const fixture = join(directory,"error.txt");
let server;
try {
  await writeFile(mock,`#!/usr/bin/env node
const fs = require("node:fs");
if (process.argv[2]!=="backend" || process.argv[3]!=="copyid" ||
    process.argv[4]!=="cet6drive:" ||
    !["./feed.txt","./reading.txt"].includes(process.argv[6]) ||
    !process.argv.includes("drive.readonly")) process.exit(2);
if (fs.existsSync(process.env.CET6_TEST_ERROR)) {
  console.error(fs.readFileSync(process.env.CET6_TEST_ERROR,"utf8"));
  process.exit(1);
}
if (process.argv[6]==="./reading.txt") {
  fs.writeFileSync(process.argv[6], "01｜词汇  VOCABULARY\\n• autonomy /ɔːˈtɑːnəmi/｜自主权；自主性\\n");
} else {
  fs.writeFileSync(process.argv[6], "CET6_SYNC_V1\\n");
}
`);
  if (!isWindows) await chmod(mock,0o700);
  const origin = "http://127.0.0.1:15173";
  const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js",import.meta.url));
  server = spawn(process.execPath,[vite,"--host","127.0.0.1","--port","15173","--strictPort"],
    {stdio:"ignore",env:{
      ...process.env,
      CET6_TEST_ERROR:fixture,
      ...(isWindows ? {CET6_TEST_RCLONE_JS:mock} : {}),
      PATH:directory+delimiter+process.env.PATH,
    }});
  let result;
  for (let i=0;i<50;i++) {
    result = await fetch(origin+"/api/drive-sync",{method:"POST",headers:{Origin:origin}}).catch(()=>undefined);
    if (result) break;
    await pause(100);
  }
  assert.equal(result?.status,200);
  assert.equal(await result.text(),"CET6_SYNC_V1\n");
  const readingRes = await fetch(origin+"/api/drive-reading-sync",{method:"POST",headers:{Origin:origin}});
  assert.equal(readingRes.status,200);
  assert.match(await readingRes.text(),/autonomy/);
  assert.equal((await fetch(origin+"/api/drive-reading-sync",{method:"POST",headers:{Origin:"https://other.invalid"}})).status,403);
  assert.equal((await fetch(origin+"/api/drive-sync",{method:"POST",headers:{Origin:"https://other.invalid"}})).status,403);
  assert.equal((await fetch(origin+"/api/drive-sync")).status,403);
  await writeFile(fixture,"invalid_grant debug-detail-that-must-stay-local");
  result = await fetch(origin+"/api/drive-sync",{method:"POST",headers:{Origin:origin}});
  assert.equal(result.status,503);
  assert.match(await result.text(),/^Google 拒绝了当前授权。请运行 rclone config reconnect cet6drive: 后重试。$/);
  console.log("Local Drive bridge, read-only command and origin restrictions passed.");
} finally {
  if (server) {
    const exited = new Promise(resolve => server.once("exit", resolve));
    server.kill();
    await Promise.race([exited, pause(1500)]);
  }
  await rm(directory,{recursive:true,force:true}).catch(()=>{});
}
