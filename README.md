# 轻舟简历

[简体中文](README.md) | [English](README.en.md)

[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) ![Vue](https://img.shields.io/badge/Vue-3.5-42b883) ![Vite](https://img.shields.io/badge/Vite-7.1-646CFF) ![NestJS](https://img.shields.io/badge/NestJS-11-E0234E)

## 项目介绍

轻舟简历是一个免费、开源的在线简历工具，围绕简历制作、内容优化和求职准备，提供表单编辑、实时分页预览、多种排版主题与行业范本，支持无水印导出。

你可以从范本开始填写，也可以导入已有简历，借助 AI 生成内容、优化经历、分析岗位匹配情况，并继续进行面试训练和投递记录管理。

项目采用 Vue 3、TypeScript、Vite 与 NestJS，使用 pnpm 工作区管理前后端及共享包，简历数据、排版引擎和智能体能力按职责独立维护。

[在线使用轻舟简历](https://qzcv.net)

## 主要功能

- **简历编辑**：表单填写与实时分页预览，支持模块管理、拖拽排序、主题切换与排版调整。
- **模板与范本**：提供多种排版主题和岗位内容范本，可直接套用后继续编辑。
- **导入与管理**：支持已有简历导入、多份简历管理、分类标签，以及本地保存与备份。
- **AI 简历助手**：支持简历生成、内容改写、评分、优化与翻译，可通过对话处理简历内容。
- **岗位适配**：对照岗位要求分析简历证据，预览并另存定制版本。
- **面试训练**：支持基于简历与目标岗位的模拟面试、专项准备、复盘及训练记录。
- **求职辅助**：记录投递、面试与录用进度，提供求职指南、离职决策评分、录用条件对比和真实时薪计算工具。
- **导出与备份**：支持 PDF、图片与 Markdown 导出，以及 JSON 完整备份。

## 项目结构

| 目录 | 职责 |
| --- | --- |
| `apps/web` | 简历网页端，包含编辑器、模板、工作区及求职工具 |
| `apps/server` | 简历服务端，提供 PDF 导出、使用统计、AI 接口与仓库星标查询 |
| `packages/resume-core` | 公共简历字段、格式、媒体、脱敏与快照处理 |
| `packages/resume-agent` | 简历生成、导入、优化、评分、翻译与写入工具 |
| `packages/interview-agent` | 面试准备、模拟、评价与复盘能力 |
| `packages/agent` | 通用智能体组装与运行能力 |
| `packages/ai` | 模型请求、流式响应解析与服务商适配 |
| `deploy` | 部署配置 |
| `knowledges` | 项目开发约定与经验文档 |

## 本地运行

### 环境要求

- Node.js：`^20.19.0` 或 `>=22.12.0`。
- pnpm：使用项目声明的 `10.34.5` 版本。

### 安装与配置

```shell
pnpm install

# 创建本地开发环境配置
cp apps/web/.env.example apps/web/.env.development
cp apps/server/.env.example apps/server/.env.development
```

按模板注释填写站点地址、服务接口、简历数据库和模型等配置。实际配置保存在对应的分环境文件中，不提交到仓库。

服务端安装依赖时会安装 PDF 导出所需的浏览器内核。简历数据库连接失败时，服务端会跳过统计模块，其他服务继续启动。

### 启动开发服务

```shell
# 同时启动网页端与服务端
pnpm dev

# 单独启动网页端
pnpm dev:web

# 单独启动服务端
pnpm dev:server
```

网页根路径统一进入 `/resume`。AI 服务商与模型可在应用内的 AI 设置中配置。

### 构建

```shell
# 构建工作区
pnpm build

# 单独构建网页端
pnpm build:web

# 单独构建服务端
pnpm build:server
```

网页端构建包含公开页面预渲染，构建环境需安装相应浏览器内核。详细配置与部署约定见 [网页端说明](apps/web/README.md)、[服务端说明](apps/server/README.md) 和 [公开页面说明](apps/web/src/views/resume/seo/README.md)。

## 开源协议

本项目基于 [MIT License](LICENSE) 开源，可自由使用、修改与分发。
