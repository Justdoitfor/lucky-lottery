# 🌸 彩票随机号码生成器

春日清新风格的彩票辅助工具，支持**双色球**和**大乐透**的随机号码生成、期次实时获取、开奖查询与中奖核对。

**技术栈**：纯 HTML/CSS/JS 单文件前端 + Cloudflare Pages Functions + GitHub 开源彩票数据

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 🎲 随机号码生成 | Fisher-Yates 洗牌 + crypto 随机源，每注独立随机 |
| 🗓 实时期次获取 | 从 GitHub 数据仓库读取最新已开期次，自动推算当前在售期次 |
| ✏️ 手动编辑号码 | 点击球号可直接编辑，自动排序、校验、去重 |
| 💰 购买价格提示 | 根据注数实时显示合计购买金额 |
| 📋 历史记录管理 | 本地持久化存储，刷新不丢失，支持删除 |
| 🔍 开奖结果查询 | 一键从 GitHub 数据源获取指定期次开奖号码 |
| 🏆 中奖核对 | 自动高亮命中球号，匹配奖级并估算奖金 |
| 🔔 中奖弹窗提醒 | 进入页面自动检测历史中的中奖记录 |
| 📱 移动端适配 | 完整响应式设计，横向滚动号码行，适配各尺寸手机 |
| 🌸 磨砂玻璃 UI | 春日清新渐变背景 + 磨砂玻璃卡片质感 |

---

## 支持的彩票

| 彩票 | 类型 | 玩法 | 开奖时间 | 每注 |
|------|------|------|---------|------|
| 双色球 | 福彩 | 前区 1-33 选6红球 + 后区 1-16 选1蓝球 | 每周二、四、日 | ¥2 |
| 大乐透 | 体彩 | 前区 1-35 选5 + 后区 1-12 选2 | 每周一、三、六 | ¥2 |

---

## 项目结构

```
/
├── index.html                  # 完整前端应用（单文件，1600+ 行）
├── _headers                    # Cloudflare Pages 安全响应头
├── _redirects                  # SPA 路由回退
├── .gitignore
├── README.md
└── functions/
    └── api/
        └── lottery.js          # Pages Function：读取 GitHub 彩票数据
```

---

## 数据来源

开奖数据来自开源仓库 [yangxb919/lottery-data](https://github.com/yangxb919/lottery-data)：

- 数据源：500.com 彩票历史数据
- 更新方式：GitHub Actions 每次开奖后约 30 分钟自动抓取并提交
- 覆盖范围：双色球（3400+ 期）、大乐透（2800+ 期）全历史数据
- 格式：JSON，示例：
  ```json
  { "issue": "26060", "date": "2026-05-28",
    "red": ["07","09","10","16","22","27"], "blue": ["11"] }
  ```

**无需任何 API Key** — 数据完全公开免费。

---

## 本地运行

直接用浏览器打开 `index.html` 即可使用大部分功能（号码生成、历史管理、手动中奖查询）。

> 开奖自动查询需要部署到 Cloudflare Pages（Pages Function 代理 GitHub 请求）。

---

## 部署到 Cloudflare Pages

### 前置条件

- [Cloudflare 账号](https://dash.cloudflare.com)（免费）
- [GitHub 账号](https://github.com)

### 第一步：推送到 GitHub

1. 在 GitHub 新建仓库（Public 或 Private 均可）
2. 将本项目所有文件上传到仓库根目录（GitHub 网页拖拽上传即可）

### 第二步：Cloudflare Pages 连接 GitHub

1. [Cloudflare 控制台](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Connect to Git**
2. 授权 GitHub，选择刚创建的仓库
3. 构建配置全部留空（Framework preset 选 `None`，Build command 留空）
4. 点击 **Save and Deploy**，等待约 1 分钟

### 第三步：完成

访问分配的 `xxx.pages.dev` 域名即可使用全部功能，**无需配置任何环境变量**。

---

## 架构

```
浏览器
  │
  ├─ 静态文件（index.html）← Cloudflare Pages CDN
  │
  └─ POST /api/lottery { type: "ssq" }
              │
       Pages Function (lottery.js)
              │  无需 API Key
              ↓
       raw.githubusercontent.com/yangxb919/lottery-data
              │  读取 latest.json 或 ssq.json / dlt.json
              ↓
       返回 { issue, date, red[], blue[] }
              │
       浏览器展示期次 / 高亮开奖号码
```

Pages Function 作为代理的原因：浏览器直接请求 `raw.githubusercontent.com` 可能受 CORS 限制，通过同域 Function 转发可完全避免此问题。

---

## 数据存储

所有历史记录保存在**浏览器本地 `localStorage`**：

- ✅ 不上传任何服务器，完全本地
- ✅ 刷新页面后保留
- ⚠️ 清除浏览器数据后丢失，建议截图保存重要号码

---

## 免责声明

本工具仅供娱乐参考，号码由随机算法生成，不保证中奖。彩票有风险，购买需理性，**未满 18 周岁禁止购买彩票**。开奖信息以彩票官方渠道公布的结果为准。
