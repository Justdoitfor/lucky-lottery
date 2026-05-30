# 🌸 彩票随机号码生成器

一款基于春日清新风格的彩票辅助工具，支持国内主流彩票的随机号码生成、期次实时获取、开奖查询与中奖核对。

**技术栈**：纯 HTML/CSS/JS 单文件前端 + Cloudflare Pages Functions + Tavily Search API

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 🎲 随机号码生成 | Fisher-Yates 洗牌 + crypto 随机源，5 种彩票 |
| 🗓 实时期次获取 | 通过 Tavily 搜索获取最新真实期次，无本地推算 |
| ✏️ 手动编辑号码 | 点击球号可直接编辑，自动排序、校验、去重 |
| 💰 购买价格提示 | 根据注数实时显示合计购买金额 |
| 📋 历史记录管理 | 本地持久化存储，刷新不丢失，支持删除 |
| 🔍 开奖结果查询 | Tavily 实时搜索开奖号码，自动高亮命中球 |
| 🏆 中奖金额计算 | 自动匹配奖级并计算每注及合计预估奖金 |
| 🔔 中奖弹窗提醒 | 进入页面自动检测历史记录中的中奖情况 |
| 📱 移动端适配 | 完整响应式设计，支持 iPhone/Android |
| 🌸 磨砂玻璃 UI | 春日清新风格，磨砂玻璃卡片质感 |

---

## 支持的彩票类型

| 彩票 | 类型 | 玩法说明 | 开奖时间 | 每注价格 |
|------|------|---------|---------|---------|
| 双色球 | 福彩 | 前区 1-33 选6红球 + 后区 1-16 选1蓝球 | 每周一、三、六 | ¥2 |
| 大乐透 | 体彩 | 前区 1-35 选5 + 后区 1-12 选2 | 每周一、三、六 | ¥2 |
| 七星彩 | 体彩 | 7个位置各选0-9，顺序匹配 | 每周日、二、四 | ¥2 |
| 福彩3D | 福彩 | 3个位置各选0-9，直选/组选 | 每日 | ¥2 |
| 排列五 | 福彩 | 5个位置各选0-9，直选 | 每日 | ¥2 |

---

## 项目结构

```
lottery/
├── index.html                  # 完整前端应用（单文件）
├── _headers                    # Cloudflare Pages 安全响应头
├── _redirects                  # SPA 路由回退规则
├── .gitignore
├── README.md
└── functions/
    └── api/
        └── lottery.js          # Pages Function：Tavily 搜索代理
```

---

## 本地运行

无需构建工具，直接用浏览器打开 `index.html` 即可使用基础功能（生成号码、历史管理、手动中奖查询）。

开奖查询功能需要部署到 Cloudflare Pages 才能使用（需要 Pages Function + Tavily API Key）。

---

## 部署到 Cloudflare Pages

### 前置条件

- [Cloudflare 账号](https://dash.cloudflare.com)（免费）
- [Tavily API Key](https://app.tavily.com)（免费，每月 1000 次搜索）
- [GitHub 账号](https://github.com)

### 第一步：推送到 GitHub

1. 在 GitHub 新建仓库（Public 或 Private 均可）
2. 将本项目所有文件上传到仓库根目录

   > 直接在 GitHub 网页拖拽上传即可，无需命令行

### 第二步：Cloudflare Pages 连接 GitHub

1. 打开 [Cloudflare 控制台](https://dash.cloudflare.com) → **Workers & Pages**
2. 点击 **Create** → **Pages** → **Connect to Git**
3. 授权 GitHub，选择刚创建的仓库
4. 构建配置保持默认（全部留空）：
   - Framework preset：`None`
   - Build command：留空
   - Build output directory：留空
5. 点击 **Save and Deploy**，等待约 1 分钟完成

### 第三步：配置环境变量

Pages 部署完成后：

1. 进入 Pages 项目 → **Settings** → **Environment variables**
2. 点击 **Add variable**，添加以下变量：

   | 变量名 | 类型 | 值 |
   |--------|------|----|
   | `TAVILY_API_KEY` | **Secret**（加密存储） | `tvly-xxxxxxxxxxxxxxxx` |

3. 点击 **Save**

### 第四步：触发重新部署

1. 回到 **Deployments** 标签页
2. 找到最新的部署记录，点击右侧 **···** 菜单
3. 选择 **Retry deployment**

等待部署完成后，访问分配的 `xxx.pages.dev` 域名即可使用全部功能。

---

## 获取 Tavily API Key

1. 访问 [app.tavily.com](https://app.tavily.com)
2. 注册账号（支持 Google 登录）
3. 在控制台创建 API Key，格式为 `tvly-xxxxxxxxxxxxxxxxx`
4. 免费套餐：每月 **1000 次**搜索（每次期次查询消耗 1 次，开奖查询消耗 1 次）

---

## 架构说明

```
浏览器
  │
  ├─ 静态资源（index.html）← Cloudflare Pages CDN
  │
  └─ POST /api/lottery { type: "ssq" }
              │
       Pages Function (lottery.js)
              │  读取 env.TAVILY_API_KEY（服务端，前端不可见）
              ↓
       api.tavily.com/search
              │  搜索"双色球最新开奖号码期次"
              ↓
       正则解析期次 + 开奖号码
              ↓
       返回 { issue, date, red[], blue[] }
              │
       浏览器展示期次 / 高亮开奖号码
```

**安全设计**：Tavily API Key 仅存在于 Cloudflare Pages 的加密环境变量中，前端代码不含任何密钥。

---

## 数据存储说明

所有历史记录（生成的号码、期次、中奖查询结果）保存在**浏览器本地 `localStorage`** 中：

- ✅ 不上传任何服务器
- ✅ 刷新页面后保留
- ⚠️ 清除浏览器数据或换设备后会丢失
- ⚠️ 建议截图保存重要号码

---

## 免责声明

本工具仅供娱乐参考，号码由随机算法生成，不保证中奖。彩票有风险，购买需理性，未满 18 周岁禁止购买彩票。开奖信息通过网络搜索获取，请以彩票官方渠道公布的结果为准。
