# GoldPilot 项目 - Claude Code 工作指引

> 本文件为 Claude Code AI 助手提供项目上下文和工作指引

---

## 项目概述

**项目名称**：GoldPilot 黄金交易决策系统

**项目定位**：一个面向黄金交易客户的实时交易信号跟单展示系统

**技术栈**：React + Node.js + MongoDB + MetaAPI

**开始日期**：2026-05-16

---

## 📁 项目结构

```
G:\_ai交易/
├── goldpilot-frontend/      # 前端React项目（待创建）
├── goldpilot-backend/       # 后端Node.js项目（待创建）
├── docs/                    # 项目文档 ⭐
│   ├── 01-项目需求.md
│   ├── 02-技术架构.md
│   ├── 03-开发规范.md
│   └── 04-执行步骤.md
├── 开发日志/                # 开发日志 ⭐
│   └── 开发日志.md
├── ai开发计划/              # 内部文档（不提交到Git）
│   ├── 开发指导文档.txt
│   └── ai开发计划.txt
├── .gitignore               # Git忽略配置
├── CLAUDE.md                # 本文件 - Claude工作指引
└── index.html               # 原始HTML参考文件
```

---

## 📚 重要文档路径

### 必读文档（按优先级）

| 文档 | 路径 | 用途 | 优先级 |
|------|------|------|--------|
| **执行步骤清单** | `docs/04-执行步骤.md` | 开发任务清单，包含所有待办事项 | ⭐⭐⭐ |
| **项目需求** | `docs/01-项目需求.md` | 功能需求、页面设计、技术选型 | ⭐⭐⭐ |
| **技术架构** | `docs/02-技术架构.md` | 系统架构、API设计、数据库设计 | ⭐⭐ |
| **开发规范** | `docs/03-开发规范.md` | 代码规范、命名规范、最佳实践 | ⭐⭐ |
| **开发日志** | `开发日志/开发日志.md` | 每日开发记录和进度追踪 | ⭐ |

### 参考文档

| 文档 | 路径 | 用途 |
|------|------|------|
| **开发指导文档** | `ai开发计划/开发指导文档.txt` | 完整的产品设计文档 |
| **AI开发计划** | `ai开发计划/ai开发计划.txt` | 初始需求记录 |
| **原始HTML** | `index.html` | 前端实现参考 |

---

## 🎯 开发阶段

### 当前阶段：阶段0 - 项目初始化

**已完成**：
- ✅ 创建目录结构（docs/、开发日志/）
- ✅ 创建开发文档（需求、架构、规范、步骤）
- ✅ 创建开发日志模板

**进行中**：
- 🔄 配置.gitignore
- 🔄 配置CLAUDE.md

**待办**：
- ⏳ 推送到GitHub
- ⏳ 开始阶段1：前端React项目搭建

### 开发阶段概览

```
阶段0：项目初始化          [███████████████████████] 80%
阶段1：前端React项目搭建   [░░░░░░░░░░░░░░░░░░░░░]   0%
阶段2：后端Node.js项目搭建 [░░░░░░░░░░░░░░░░░░░░░]   0%
阶段3：集成与优化         [░░░░░░░░░░░░░░░░░░░░░]   0%
阶段4：部署上线           [░░░░░░░░░░░░░░░░░░░░░]   0%
```

---

## 🛠 工作流程

### 开发新功能时

1. **查阅文档**
   - 先阅读 `docs/04-执行步骤.md` 确认当前阶段任务
   - 参考相关文档（需求、架构、规范）

2. **创建分支**
   ```bash
   git checkout develop
   git checkout -b feature/功能名称
   ```

3. **开发功能**
   - 遵循 `docs/03-开发规范.md` 的代码规范
   - 参考现有代码实现

4. **测试验证**
   - 运行测试
   - 手动测试功能

5. **提交代码**
   ```bash
   git add .
   git commit -m "feat: 功能描述"
   git push origin feature/功能名称
   ```

6. **更新文档**
   - 更新 `开发日志/开发日志.md`
   - 记录遇到的问题和解决方案

### 修复Bug时

1. 在GitHub创建issue
2. 创建hotfix分支
3. 修复并测试
4. 更新文档
5. 提交并合并

---

## 📝 日志更新规范

### 每日开发日志模板

在 `开发日志/开发日志.md` 中添加：

```markdown
## YYYY-MM-DD - [阶段名称]

### ✅ 今日完成
1. [完成的任务描述]
2. [完成的任务描述]

### 🚧 遇到的问题
- [问题描述]
  - 错误信息：[具体错误]
  - 影响范围：[受影响的功能]

### 💡 解决方案
- [解决方法]
- [相关代码]：`文件路径:行号`

### 📋 明日计划
1. [待办任务]
2. [待办任务]

### 📝 代码变更
- **主要文件**：
  - `path/to/file.ts` - [变更说明]
  - `path/to/file.tsx` - [变更说明]
```

---

## 🎨 代码规范速查

### TypeScript
```typescript
// 组件：PascalCase
export function PriceCard() {}

// 变量/函数：camelCase
const currentPrice = 0;
function calculateSignals() {}

// 常量：UPPER_SNAKE_CASE
const MAX_SIGNAL_COUNT = 100;

// 接口/类型：PascalCase
interface Signal {}
type SignalDirection = 'long' | 'short';
```

### 文件命名
```
组件文件：PriceCard.tsx
工具文件：format.ts
类型文件：types.ts
样式文件：styles.css
```

### Git提交
```
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式
refactor: 重构
test: 测试
chore: 构建/工具链
```

---

## 🔧 开发环境

### 前端
```bash
cd goldpilot-frontend
npm install          # 安装依赖
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run lint         # 代码检查
npm run type-check   # 类型检查
```

### 后端
```bash
cd goldpilot-backend
npm install          # 安装依赖
npm run dev          # 启动开发服务器
npm run build        # 构建TypeScript
npm run lint         # 代码检查
pm2 start ecosystem.config.js  # 生产环境启动
```

---

## 📊 关键技术指标

### 信号计算逻辑
```typescript
// 趋势判断
趋势判断：EMA89 < EMA233 = 空头，EMA89 > EMA233 = 多头

// 信号触发
做空信号：空头趋势 + EMA21下穿EMA89（死叉）
做多信号：多头趋势 + EMA21上穿EMA89（金叉）

// 止盈目标
止盈价格 = 当前周期ATR14 × 5
```

### MT4/MT5测试账号
```
账号：27238218
服务器：VTMarkets-Live 8
观摩密码：Abc1234@
```

---

## ⚠️ 重要注意事项

### 不要提交到Git
- ❌ `.env` 文件（环境变量）
- ❌ `node_modules/` 目录
- ❌ `ai开发计划/` 目录（内部文档）
- ❌ `.claude/` 目录（Claude配置）
- ❌ `dist/` 或 `build/` 目录

### 必须提交到Git
- ✅ `docs/` 目录（项目文档）
- ✅ `开发日志/` 目录（开发日志）
- ✅ 源代码文件
- ✅ 配置文件（.gitignore, tsconfig.json等）

### 开发原则
1. **稳步推进**：按 `docs/04-执行步骤.md` 的顺序进行，不要跳步骤
2. **文档先行**：遇到问题先查阅文档
3. **记录日志**：每日更新开发日志
4. **代码规范**：严格遵守开发规范
5. **测试验证**：每个功能完成后都要测试

---

## 🆘 常见问题

### Q: 需要实现什么功能？
A: 查看 `docs/01-项目需求.md` 和 `docs/04-执行步骤.md`

### Q: 如何实现某个功能？
A: 查看 `docs/02-技术架构.md` 了解技术方案

### Q: 代码规范是什么？
A: 查看 `docs/03-开发规范.md`

### Q: 当前进度如何？
A: 查看 `开发日志/开发日志.md`

### Q: 这个文件该怎么写？
A: 参考现有代码和 `docs/03-开发规范.md`

---

## 📞 联系方式

- **技术问题**：查阅 `docs/` 目录下的相关文档
- **进度追踪**：查看 `开发日志/开发日志.md`
- **任务清单**：查看 `docs/04-执行步骤.md`

---

**最后更新**：2026-05-16
**文档版本**：v1.0
**维护者**：GoldPilot 开发团队
