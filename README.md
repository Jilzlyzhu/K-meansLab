# K-meansLab · 湖畔实验室

面向高一人工智能通识课的 K-means 项目式学习工具。以“太湖水质特征分群”为情境，贯穿一节 40 分钟课堂，支持学生实验、分层导学与教师过程评价。

**数据为教学模拟。聚类发现相似群体，不直接认定水质等级或发布蓝藻预警。**

## 课堂流程

1. **发现问题**：观察 40 个点位、5 个数值特征，认识无监督学习。
2. **手算建模**：换单位与尺度实验；按最近距离分配，逐维计算均值；核对质心，再手算一个点的 SSE 贡献。
3. **实验验证**：二维逐步模拟 → 二维、三维与五维比较 → 三维不同起点对照 → 比较 K 并读取肘部图。
4. **迁移与反思**：自动生成成果卡，完成两道判断、一个学习需求选择和可选的简短补充。

二维探究使用平面图；三维及五维投影使用可旋转的 Three.js 模型。所有距离、质心与 SSE 均由计算工具生成。

## 快速运行

教师电脑需安装 **Node.js 20 或更高版本**，学生使用当前版本的 Edge 或 Chrome。三维视图需要 WebGL 2。

```sh
git clone https://github.com/Jilzlyzhu/K-meansLab.git
cd K-meansLab
npm start
```

预打包文件随仓库提供，直接开课**无需安装 npm 依赖**。Windows 也可双击 `启动课堂.cmd`。

- 教师端：http://localhost:4173/?view=teacher
- 学生入口：http://localhost:4173/
- 教师创建课堂后，将页面显示的局域网地址和课堂码提供给学生。
- 默认端口为 `4173`，可通过环境变量 `PORT` 修改。

在其他电脑访问时，需处于可互通的网络，并允许教师电脑的对应端口访问。本项目不会自动更改防火墙。

## 教师端与学习助手

- 四环节进度、环节开放、暂停提交、投屏模式。
- 四块证据概览：关键任务作答表现、常见误区、K 方案与依据、下一步学习需求。
- 查看学生原始回答、教师复核、导出 CSV / JSON，以及确认后删除单条学生记录。
- 默认使用**本地规则导学**；可在教师端接入兼容 Chat Completions 的大模型服务，启用生成式对话和补充点评。未配置时不冒称已连接大模型。

## 数据与离线使用

课堂数据默认保存在教师电脑的 `data/`，模型配置与远程教师凭据也保存在该目录。它们不会提交到本仓库。可通过 `DATA_DIR` 指定其他保存目录。

`public/offline.html` 是无外部网络依赖的单文件备用版，可复制后双击使用；离线记录只保存在当前浏览器，不自动汇总至教师端。

## 开发与验证

```sh
npm ci
npm run build
npm test
```

- `npm run build`：打包 Three.js，并生成离线页面、模拟数据表与教师计算参考。
- `npm test`：验证算法、评价统计、课堂服务、权限、删除与持久化。
- 仅修改普通页面脚本或样式后，可执行 `npm run build:offline` 同步离线页面。

浏览器验收另需 Playwright：

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
```

在线浏览器验收会创建和删除测试记录，须使用独立数据目录和端口。例如在 PowerShell 中先启动测试服务：

```powershell
$env:PORT='4181'
$env:DATA_DIR='./artifacts/browser-test-data'
node server.js
```

在另一个终端运行：

```powershell
$env:TEST_BASE_URL='http://localhost:4181'
node scripts/browser-check.js
node scripts/teacher-evidence-check.js
node scripts/offline-check.js
```

也可设置 `TEST_BROWSER_EXECUTABLE` 使用本机已安装的 Edge 或 Chrome。未设置时使用 Playwright 安装的 Chromium。

## 文件说明

| 路径 | 用途 |
|---|---|
| `server.js` | 课堂服务、数据保存、教师权限与模型接入 |
| `public/engine.js` | K-means、距离、均值、SSE 与评价统计 |
| `public/app.js` | 学生页面、学习助手与教师工作台 |
| `public/lab.js` | 实验任务与逐步模拟 |
| `public/lab2d.js` | 二维平面图 |
| `src/lab3d.js` | Three.js 三维视图源代码 |
| `public/offline.html` | 离线备用单文件 |
| `tests/` | 算法和服务测试 |

详见 [使用说明](使用说明.md) 与 [验收记录](验收记录.md)。Three.js 许可证见 [THREE-LICENSE.txt](public/THREE-LICENSE.txt)。

仓库上传不等于网站部署。包含教师记录和模型服务的完整课堂需要运行 Node.js 服务，GitHub Pages 不能直接运行该后端。
