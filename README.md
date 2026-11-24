# 六级英语复盘台 · 本地版

## 直接使用

平时使用 Google Drive 同步时，在项目目录运行 `npm run dev`，然后用原来的浏览器打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。离线使用时，构建后用 Chrome、Edge 或 Safari 打开 `dist/study.html`。随包放在项目同级的 `study.html` 是旧版。

页面自带 341 个词书词条、三种单词练习、听力复盘和阅读趋势。浏览器按使用的地址或文件路径保存进度。换电脑、浏览器、网址或 HTML 文件路径前，先在「单词复盘 → 本机学习数据」导出 JSON 备份。

随包个人备份 `cet6-learning-backup.json` 可从页面底部的「本机学习数据」导入。备份包含从站点读到的词条和复习进度，以及部分阅读资料摘要。部分旧阅读全文及历史记录只取得节选或标题，其原始内容可回旧站查阅。

## 听力复盘

从侧栏进入「听力复盘」，可按错题、猜对题、推断正确和听力词块筛选，或只看今日到期的条目。搜索 `S01` 至 `S05` 可查对应题源。展开卡片可核对原作答、答案、录音节选、复盘标签和词块释义。英文朗读使用浏览器语音。点击「已掌握」或「还不熟」后，下一次复习日期和记录会保存在本机，并随学习备份一起导出。

截至 2026 年 11 月 24 日的归档覆盖 5 组题源，收录 12 道错题、7 道猜对题、1 道推断正确题和 119 条词块。另保留首批四条独有的词块，合计 123 条。教材题的考试年月、真题（二）第 2 题的初选字母以及部分错因沿用归档中的「待核实」标记。来源见 [《听力选项速读技巧》](https://chatgpt.com/c/6ac78330-4a10-83ea-abec-32673cfe8ac6)。

## 修改代码（Mac / Windows）

安装 Node.js 22.13 或更高版本。在终端打开当前 `project` 文件夹，运行：

```sh
npm ci
npm run dev
```

打开终端显示的本地地址，一般为 `http://127.0.0.1:5173`。开发模式和双击 HTML 是两个存储位置，需要借助页面上的导出、导入备份来转移进度。

```sh
npm run build
node scripts/check-local.mjs ../cet6-learning-backup.json
```

构建包含 TypeScript 类型检查、Vite 打包和单文件生成。回归脚本检查旧备份导入、听力和词汇复习进度恢复、Drive 词条去重与合并，以及独立 HTML 的资源内联。若身边没有随包备份，可去掉命令末尾的路径参数。

## agy 接手

在 Antigravity（agy）中打开当前 `project` 文件夹。个人备份位于项目外侧。

- 侧栏入口在 `src/page.tsx`，听力卡片和筛选在 `src/listening-review.tsx`，样式在 `src/vocabulary.css`。
- 题目与题源名称维护在 `src/listening-data.ts`，归档词块按题源和话题维护在 `src/listening-chunks.ts`。题目 ID 使用题源或套卷加题号，词块使用固定短名。更新内容时沿用已发布的 ID，以便匹配原有复习进度。听力记录使用 `kind: "listening"`。
- `src/local-store.ts` 管理原有本地存储键 `cet6-vocabulary-local-v1`、Drive 缓存键 `cet6-vocabulary-drive-v1` 和 `{ records: [...] }` 备份格式。导入按记录 ID 和版本号合并。听力和词汇共用 `src/review-schedule.ts` 的间隔复习规则。
- `src/daily-vocabulary.ts` 存放词书词表。Drive 下载桥在 `vite.config.mjs`，客户端词条合并逻辑在 `src/local-store.ts`。同步文档继续使用 `CET6_SYNC_V1`。

## 启用 Google Drive 自动同步

1. 在电脑安装 rclone（Mac 可用 `brew install rclone`，Windows 可从 https://rclone.org/downloads/ 下载并将 rclone 加入 PATH）。
2. 在电脑终端运行 `rclone config create cet6drive drive scope drive.readonly`。在浏览器选择拥有同步文档的 Google 账号，并确认只读授权。授权凭据由 rclone 保存在本机，别提交到仓库。Google Drive 的该只读授权可读取账号下文件，本项目只请求指定的同步文档。
3. 在 `project` 目录运行 `npm ci`（首次），再运行 `npm run dev`。在同一个浏览器打开 `http://127.0.0.1:5173`。本地版启动时拉取一次，随后页面打开期间每 10 分钟检查。也可以在「本机学习数据」点击「立即同步 Google Drive」。
4. 若以前用双击 HTML 复习，先从旧 HTML 导出最新备份，在 5173 页导入一次，之后固定从 5173 打开即可。

同步只下载词条与释义。听力资料随构建发布，听力和单词的练习进度都保存在本机。可以随时关闭本地服务，云端更新会在下次打开时读取。

### Windows 下载测试

用授权 rclone 时选择的 Google 账号打开 [CET6 Vocabulary Sync](https://docs.google.com/document/d/1MWEtvzIlvIb5yyHFnqMUZIzrt1gXvulG6fzKI_yV878)。然后在能够启动复盘台的 PowerShell 运行：

```powershell
rclone listremotes
$cet6Check = Join-Path $env:TEMP ([guid]::NewGuid().ToString() + ".txt")
rclone backend copyid cet6drive: 1MWEtvzIlvIb5yyHFnqMUZIzrt1gXvulG6fzKI_yV878 $cet6Check --drive-export-formats txt --drive-scope drive.readonly --retries 1 --low-level-retries 1 --contimeout 8s --timeout 20s
if ($LASTEXITCODE -eq 0) { Get-Content $cet6Check -TotalCount 1 }
if (Test-Path $cet6Check) { Remove-Item $cet6Check }
```

显示 `CET6_SYNC_V1` 表示已读到同步文档。若有报错，可分享错误最后一行。请勿分享 rclone 配置或任何含 `token` 的日志。若曾分享凭据，请在 [Google 账号的第三方连接](https://myaccount.google.com/connections) 撤销 rclone，再运行 `rclone config reconnect cet6drive:` 重新授权。
