# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目是什么

Poke'Catch 网页游戏的挂机助手，打包成 Chrome / Edge（MV3）扩展。源码和注释都是中文。没有 package.json、没有依赖、没有 lint 和测试框架，只需要 Node.js。版本号只在 `version.json` 里改。`research/`（游戏官方文件与中间产物）被 `.gitignore` 忽略，不要提交，也不要假定它存在。

## 常用命令

```bash
node tools/build.js          # 构建，产物在 dist/（已忽略）
node tools/sim-test.js       # 离线跑对战模拟：固定阵容打关都联盟各间
node tools/sim-check.js      # 离线核对战斗模型/配招/换人打分的自检输出
node tools/ext-check.js      # 用假的 chrome.storage 自测 bridge.js + app-wrap.js，不开浏览器
node tools/sim-blue.js       # 离线细看冠军战的对战模拟
node tools/hook-src.js       # 打印 012 里注入页面的挂钩源码（单行），给 CDP 预注入用
```

- 这些校验脚本是手动对比输出的，没有断言，也没有单测运行器。
- `build.js` 自带 `node --check` 语法检查，改完 `src/` 后先构建一遍。
- 在浏览器里实测：先构建，再在 `chrome://extensions` 开启开发者模式，加载已解压的 `dist/ext-<版本>/`；改完代码重新构建后在该页面点扩展的刷新按钮。
- `tools/gen-data.js` 把 `guide/chapters.json` 精简成 `data/chapters.json`。日常构建不需要跑它；`data/evo.json`、`data/battle.json` 和 `src/060` 的来源在仓库外（游戏提取目录），仓库里没有对应生成脚本。

## 构建架构（改代码前必读）

`tools/build.js` 把 `src/` 里所有匹配 `^\d+-.+\.js$` 的文件按文件名排序，直接拼进**一个 IIFE 闭包**，再注入 `data/*.json` 作为 `__DATA__.<文件名>`。因此：

- 模块之间没有 import/export，全部共享同一个词法作用域；常量在 `010`，全局状态对象 `S` 在 `090`，主循环 `tick` 在 `450`。
- 加载顺序就是数字前缀顺序，被依赖的东西必须放在前缀更小的文件里。新增模块要挑一个合适的前缀（已有 012、245、345、347 这类插入编号）。
- 源码里的 `{{VERSION}}` 会在构建时替换成 `version.json` 的版本号。
- `060`（标注自动生成，勿手改）是数据表，不要手工编辑。

构建产物是 `dist/ext-<版本>/`（加同名 zip），只维护浏览器扩展这一种形态。

## 扩展的三层结构

`ext/manifest.json` 声明三个 content script，都在 `document_start` 运行：

1. `hook.js`（页面世界 MAIN）：**不是手写文件**，是 `src/012-游戏接口.js` 里 `NS_HOOK` 模板字面量的原样落地。它临时替换 `Object.freeze` / `Object.defineProperty`，在游戏把模块对象冻结前截获成 `window.__pcautoNS`（游戏内部接口，供沙盒重放配队和实战统计）。构建会检查 `NS_HOOK` 内不得出现 `${` 或反斜杠，否则直接报错。
2. `bridge.js`（隔离世界）：页面脚本碰不到 `chrome.storage`，由它转手。只认 `pcauto.` 前缀的键，与页面之间的消息都是 JSON 字符串（`pcauto-ext:*` 自定义事件）。
3. `app.js`（页面世界 MAIN）：`ext/app-wrap.js` 包着整个闭包，等 bridge 送来存储快照后，用同步缓存提供 `extGet / extSet / extDel`，并传入 `PCAUTO_EXT`。`src/010` 把它们包成 `storeGet / storeSet / storeDel`，其余模块只用这一层。3 秒没收到快照就当作桥失效（`HAS_STORE` 为 false）。

`popup.html` / `popup.js` 读 bridge 写入的 `_status` 显示运行状态。若页面里已有另一份在运行，这一份不启动并提示（`450` 里的 `dupWarn`）。

## 约束与注意点

- 配队/对战模拟相关模块（`060`、`062`、`065`、`066`，以及 `070` 的一段）会被 `sim-test.js`、`sim-check.js` 用 `new Function` 单独加载，必须保持不依赖 DOM 和外部全局变量，只依赖 `__DATA__`；`sim-check.js` 还靠 `070` 里 `const LOADOUT_DOT` 和 `/** 推荐配招对现阵容` 这两个标记截取代码，改动时别破坏它们。
- 游戏接口是只读与沙盒重放：不调用 Cloud、不写游戏存档。拿不到 `__pcautoNS` 时退回 DOM / localStorage 方式。
- 允许的站点在 `tools/build.js` 的 `MATCHES` 里维护，manifest 由它生成。
- 构建在 Windows 上显式使用系统 `tar.exe` 打 zip（Git Bash 的 GNU tar 会把 `D:\...` 当成远程路径）。
- `guide/` 是依据游戏源码整理的攻略（规则、84 章逐章数据），`data/chapters.json` 由其生成；代码里的等级上限、章节循环等规则以它为准。
