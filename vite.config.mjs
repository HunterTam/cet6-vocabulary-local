import { defineConfig } from "vite";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const documentId = "1MWEtvzIlvIb5yyHFnqMUZIzrt1gXvulG6fzKI_yV878";
const readingDocumentId = "1im9IlE05N7Gc0pkwDAFHpGUCxTIs2ZQt8dkZ4vvaVcQ";
const maxBytes = 2_000_000;
const pending = new Map();

function driveErrorMessage(error) {
  if (error?.syscall === "spawn rclone" && error.code === "ENOENT") {
    return "启动复盘台的终端找不到 rclone。请在能运行 rclone version 的 PowerShell 里启动复盘台。";
  }
  if (error?.message === "feed-size" || error?.message === "feed-format") {
    return "已连接 Google Drive，但同步文档格式不正确或超过大小限制。";
  }
  if (error?.message === "feed-missing") {
    return "rclone 已完成命令，但没有生成同步文件。请运行 README 中的下载测试。";
  }
  const detail = error?.stderr || "";
  if (/didn't find section in config file|config file.*not found|couldn't find.*remote/i.test(detail)) {
    return "复盘台找不到 rclone 配置 cet6drive。请在启动复盘台的 PowerShell 里运行 rclone listremotes。";
  }
  if (/invalid_grant|invalid_token|token.*(?:expired|revoked|refresh)|unauthenticated|\b401\b/i.test(detail)) {
    return "Google 拒绝了当前授权。请运行 rclone config reconnect cet6drive: 后重试。";
  }
  if (/ratelimit|quota|\b429\b/i.test(detail)) {
    return "Google Drive 暂时限制了请求频率，请稍后再同步。";
  }
  if (/filenotfound|file not found|notfound|insufficient(?:file)?permissions|\b403\b|\b404\b/i.test(detail)) {
    return "Google Drive 找不到同步文档，或当前账号无权读取。请用 rclone 授权时选择的 Google 账号打开 README 中的文档链接。";
  }
  if (error?.killed || /timeout|deadline exceeded|dial tcp|lookup .*|proxyconnect|connection (?:reset|refused)/i.test(detail)) {
    return "rclone 连接 Google Drive 失败或超时。请在启动复盘台的 PowerShell 里测试连接。";
  }
  if (/unknown (?:flag|command)|command .* not found/i.test(detail)) {
    return "当前 rclone 不支持同步所需的命令。请运行 rclone version 检查版本。";
  }
  return "rclone 下载失败。请在启动复盘台的 PowerShell 里运行 README 中的下载测试，查看具体报错。";
}

async function fetchDriveDoc(docId, fileName, validate) {
  const work = await mkdtemp(join(tmpdir(),"cet6-feed-"));
  const file = join(work,fileName);
  try {
    const args = ["backend","copyid","cet6drive:",docId,"./"+fileName,
      "--drive-export-formats","txt","--drive-scope","drive.readonly","--retries","1",
      "--low-level-retries","1","--contimeout","8s","--timeout","20s"];
    const mockScript = process.env.CET6_TEST_RCLONE_JS;
    await (mockScript
      ? run(process.execPath,[mockScript,...args],{cwd:work,timeout:30000,maxBuffer:64_000,windowsHide:true})
      : run("rclone",args,{cwd:work,timeout:30000,maxBuffer:64_000,windowsHide:true}));
    const info = await stat(file).catch((error)=>{
      if (error.code === "ENOENT") throw new Error("feed-missing");
      throw error;
    });
    if (info.size>maxBytes) throw new Error("feed-size");
    const content = await readFile(file,"utf8");
    if (!validate(content)) throw new Error("feed-format");
    return content;
  } finally {
    await unlink(file).catch(()=>{});
    await rmdir(work).catch(()=>{});
  }
}

function mountDriveRoute(server, route, docId, fileName, validate) {
  server.middlewares.use(route,async (request,response)=>{
    response.setHeader("Cache-Control","no-store");
    response.setHeader("X-Content-Type-Options","nosniff");
    if (request.method!=="POST" || !/^127\.0\.0\.1:\d+$/.test(request.headers.host || "") ||
        request.headers.origin!=="http://"+request.headers.host ||
        !["127.0.0.1","::ffff:127.0.0.1"].includes(request.socket.remoteAddress)) {
      response.writeHead(403).end();
      return;
    }
    try {
      let task = pending.get(route);
      if (!task) {
        task = fetchDriveDoc(docId,fileName,validate).finally(()=>{pending.delete(route);});
        pending.set(route,task);
      }
      const feed = await task;
      response.writeHead(200,{"Content-Type":"text/plain; charset=utf-8"}).end(feed);
    } catch (error) {
      response.writeHead(503,{"Content-Type":"text/plain; charset=utf-8"}).end(driveErrorMessage(error));
    }
  });
}

function install(server) {
  mountDriveRoute(
    server,
    "/api/drive-sync",
    documentId,
    "feed.txt",
    content => /^\uFEFFCET6_SYNC_V1\r?\n|^CET6_SYNC_V1\r?\n/.test(content),
  );
  mountDriveRoute(
    server,
    "/api/drive-reading-sync",
    readingDocumentId,
    "reading.txt",
    content => /0?1[｜|].*(?:词汇|VOCABULARY)|0?2[｜|].*(?:短语|PHRASES)|0?3[｜|].*(?:语句|SENTENCES)/i.test(content),
  );
}

export default defineConfig({
  plugins:[{name:"cet6-local-drive-sync",configureServer:install,configurePreviewServer:install}],
});
