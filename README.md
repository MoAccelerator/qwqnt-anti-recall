# qwqnt-Anti-Recall
QwQNT 插件 - QQNT 简易防撤回 (由原LiteLoaderQQNT-Anti-Recall迁移)


## 功能特性

- **文本消息防撤回**
  - 阻止好友/群成员撤回的文本消息从界面中消失
  - 支持可选：是否对“自己撤回的消息”也进行反撤回

- **图片资源补全与重定向**
  - 对即将被撤回的图片消息尝试补全本地文件
  - 可选：把撤回图片**额外复制**到插件数据目录的 `images/` 子文件夹，方便备份与查看

- **撤回消息持久化存储**
  - **JSON 文件存储**：明文、易读、便于手工查看与备份
  - **LevelDB 存储（使用 `level` 库）**：二进制、高性能，适合长期、大量数据
  - 设置页支持在 `JSON` / `LevelDB` 之间切换，并能显示当前实际使用的存储类型与错误信息

- **可配置的内存缓存策略**
  - **最大缓存条数**：控制内存中最多保留多少条最近消息（避免内存无限增长）
  - **单次清理条数**：触发清理时，一次删除多少旧消息（在“准确反撤回”和“内存占用”之间折中）

- **UI 样式自定义**
  - 撤回消息高亮阴影颜色（主题色）
  - 是否启用阴影效果
  - 是否在撤回消息下方显示 “已撤回” 提示条

- **基于 QwQNT Hako 的集成**
  - 使用 `qwqnt-hako` + `qwqnt-ipc-interceptor` 作为前置依赖

## 依赖与前置条件

### 运行时前置插件（QwQNT 框架）

本插件依赖以下 QwQNT 插件作为前置，需提前安装并启用：

- `qwqnt-ipc-interceptor`
- `qwqnt-hako`



## 安装（使用构建好的 zip）

1. 从 Release 或本地构建中获取 `qwqnt-anti-recall.zip`
2. 按 QwQNT 文档将 zip 安装到对应插件目录
3. 确保以下插件已启用：
   - `qwqnt-ipc-interceptor`
   - `qwqnt-hako`
   - `qwqnt-anti-recall`（本插件）
4. 重启 QQNT

## 从源码构建

> 提示：本节针对你想修改源码 / 自行编译的情况。普通用户可以直接使用现成的 zip 包。

### 环境准备

- Node.js（建议 20+）
- [pnpm](https://pnpm.io/)（`packageManager` 已配置为 `pnpm@10.x`）

### 安装依赖

pnpm install
