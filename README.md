# qwqnt-anti-recall

基于 QwQNT 框架的 **QQNT 简易防撤回**。  
本插件迁移自 [LiteLoaderQQNT-Anti-Recall](https://github.com/xh321/LiteLoaderQQNT-Anti-Recall)

## 功能简介

- 防止 QQNT 聊天消息被撤回（文本 / 部分富文本、文件消息等）
- 可选是否对「自己撤回的消息」生效
- 对被撤回的图片尝试补全、重定向到可访问链接
- 可选将被撤回的图片复制到插件数据目录的 `images/` 子目录中
- 支持两种持久化存储方式：
  - JSON 明文存储（便于查看与备份）
  - LevelDB（二进制存储，基于 `level` 库）
- 提供设置页面，可配置：
  - 是否持久化保存撤回消息
  - 存储格式（JSON / LevelDB）
  - 撤回消息高亮样式（阴影 / 主题色 / 提示文本）
  - 是否启用定期清理、最大缓存条数、单次清理数量

## 前置插件

要正常使用本插件，你**必须**先安装并启用以下前置插件：

- [`qwqnt-ipc-interceptor`](https://github.com/qwqnt-community/qwqnt-ipc-interceptor)  
- [`qwqnt-hako`](https://github.com/qwqnt-community/qwqnt-hako)

## 安装与使用

> 本节假设你已经正确安装了 QwQNT 框架，并了解如何安装 QwQNT 插件。

1. 下载构建好的 `qwqnt-anti-recall.zip` 插件包。  
2. 按 QwQNT 要求，将压缩包解压并放入插件目录。  
3. 确保以下插件在 QwQNT 中已启用：
   - `qwqnt-ipc-interceptor`
   - `qwqnt-hako`
   - `qwqnt-anti-recall`
4. 重新运行QwQNT框架。

**注意：qwqnt-hako请不要和qwqnt-renderer-events、qwqnt-plugin-settings这两个插件一起安装。**

### 设置页面说明

在 QwQNT 插件管理 / 设置页面中找到 **「防撤回（Anti-Recall）」**，进入设置页后可以配置：

- **是否将撤回消息存入数据库**
  - 关闭：只在内存中短期缓存，重启 QQNT 后撤回记录不再保留。
  - 开启：将撤回记录持久化到 JSON 或 LevelDB。
- **存储格式**
  - JSON（明文）：存储在 `<data>/qwqnt-anti-recall/qq-recalled-db.json`。
  - LevelDB（二进制）：使用 `level` 库，存储在 `<data>/qwqnt-anti-recall/qq-recalled-db.ldb`。
- **是否将撤回图片保存到数据目录**
  - 开启后，图片会额外复制到 `<data>/qwqnt-anti-recall/images/`，文件名中包含消息 ID 及简化后的原始文件名。
- **是否反撤回自己的消息**
  - 开启后，自己撤回的消息也会被保留；从下一条新消息开始生效。
- **启用定期清理**
  - 控制内存中的消息缓存大小，可配置：
    - 内存中最多缓存消息条数
    - 每次清理时删除的消息数量
- **样式配置**
  - 撤回高亮主题色（会同时影响阴影和「已撤回」提示文本颜色）
  - 是否显示阴影效果
  - 是否在消息下方显示「已撤回」提示条

## 从源码构建

> 如果你只想体验插件，可以直接使用现成的 zip 包；本节面向希望自行修改 / 构建的开发者。

### 环境要求

- Node.js（建议 20+）
- [pnpm](https://pnpm.io/)（本项目的 `packageManager` 已指定为 `pnpm@10.x`）

### 安装依赖

```bash
pnpm install
```

### 构建插件

```bash
pnpm build
```


## 开源协议

本项目使用 **MIT License** 开源。  
你可以在遵守 MIT 协议的前提下自由地使用、修改和分发本项目的代码。
