# 小芽记账帮手 · 微信记账小程序

由 Web 版 [qingji](https://github.com/jimmyfj832/qingji) 移植的微信原生小程序，功能与视觉保持一致。

零依赖、零后端，导入开发者工具即可运行；数据层已预留云开发接口，可平滑切换。

## 功能

| 模块 | 能力 |
|---|---|
| 总览 | 月度收支结余、环比、预算进度、支出构成环形图、最近记录 |
| 明细 | 按月/类型/分类筛选、备注搜索、按日期分组、点击编辑/看凭证/删除 |
| 统计 | 近 6 个月收支趋势柱状图、分类排行与占比 |
| 记一笔 | 支出/收入切换、9+5 个分类、金额、日期、备注、最多 5 张凭证图片 |
| 设置 | 昵称、月度预算、导出 CSV、清空数据、存储占用查看 |

细节优化：

- **记住上次分类**：新建时自动回填上一次用过的分类（支出/收入分别记忆），少点一步
- 删除图片延迟到保存成功后才真正清理，取消编辑不会丢图
- 多图并排展示、点击可左右滑动预览

## 目录结构

```
qingji-miniprogram/
├── app.js / app.json / app.wxss      # 入口、全局配置、全局样式与设计变量
├── project.config.json               # 开发者工具项目配置
├── sitemap.json
├── LICENSE
├── assets/
│   └── icon/                         # 小程序图标（512/144 PNG + SVG 源文件）
├── custom-tab-bar/                   # 自定义 tabBar（5 格，中间凸起"记一笔"）
├── components/
│   └── donut-chart/                  # 环形图（Canvas 2D）
├── pages/
│   ├── dashboard/                    # 总览（tab1）
│   ├── records/                      # 明细（tab2）
│   ├── stats/                        # 统计（tab3）
│   ├── settings/                     # 设置（tab4）
│   └── edit/                         # 记一笔 / 编辑（非 tab）
├── services/
│   └── ledger.js                     # 业务计算：汇总、分组、占比、趋势、CSV
├── cloudfunctions/
│   └── qingji/                       # 云函数（action 路由，仅云开发模式需要部署）
└── utils/
    ├── config.js                     # ★ 全局配置：数据模式与云环境 ID
    ├── constants.js                  # 分类与存储键
    ├── util.js                       # 金额/日期/颜色格式化
    ├── auth.js                       # 身份层（本地静默登录）
    ├── pref.js                       # 本地偏好（记住上次分类等）
    └── db.js                         # 数据层（本地实现 + 云开发实现）
```

分层约定：**pages 只调用 services 与 db**，不直接碰 storage；db 的所有方法都是 async，本地与云端实现同一套契约。

## 运行

1. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开工具 → 导入项目 → 选择本目录
3. **必须换成自己的 AppID**：改 `project.config.json` 的 `appid` 字段，或点「使用测试号」。仓库里带的是作者自己的 AppID，别人直接编译会提示无预览权限；`touristappid`（游客模式）不支持云开发与真机调试
4. 编译即可，无需任何后端或依赖安装

## 数据存储方案

默认**本地模式**：

- 账目 / 预算：`wx.setStorageSync`，按设备匿名 ID 前缀隔离
- 凭证图片：`wx.compressImage` 压缩后 `FileSystemManager.saveFile` 存入小程序文件系统（`USER_DATA_PATH`）

**身份说明**：小程序 openid 必须由服务端用 `wx.login` 的 code 换取，前端拿不到（前端存 session_key 属安全红线）。因此本地版用**设备匿名 ID** 做静默身份，用户无感、无需注册登录。换手机或清除小程序数据即视为新身份。

### 切换到云开发（多设备同步）

切换只改**一个文件** —— `utils/config.js`：

```js
module.exports = {
  MODE: 'cloud',          // 'local' | 'cloud'
  CLOUD_ENV: '你的环境ID'  // 云开发控制台首页可复制
}
```

随后按顺序完成部署：

**1. 开通云开发**
开发者工具顶部「云开发」按钮 → 开通，记下**环境 ID**。注意：测试号不支持云开发，需使用自己注册的小程序 AppID。

**2. 建集合与权限**
云开发控制台 → 数据库 → 新建两个集合：

| 集合 | 用途 | 权限 |
|---|---|---|
| `records` | 账单 | 仅创建者可读写 |
| `configs` | 预算等配置 | 仅创建者可读写 |

安全规则（`records` 与 `configs` 相同）：

```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

**3. 部署云函数**
右键 `cloudfunctions/qingji` → 「上传并部署：云端安装依赖」。云函数内已实现全部 action：`list / get / add / update / remove / getBudget / setBudget / clear`。

**4. 重新编译**
改完 `config.js` 后点「编译」，首次进入会走 `wx.cloud.init`。数据从空开始，需要的话先用本地模式的 CSV 导出留个底。

云端实现的身份取自 `cloud.getWXContext().OPENID`，**不信任前端传入的任何 uid**，每条查询都强制带 `_openid` 条件，无法越权访问他人数据。图片上传到云存储 `receipts/` 目录，删除记录时同步清理。

## 已知限制

- 本地模式不跨设备同步；建议引导用户定期导出 CSV 备份
- `FileSystemManager.saveFile` 保存目录有容量上限（约 10MB），按压缩后约 100KB/张估算，可存 100 张左右；超出后保存会失败并自动降级为不存图
- 云开发模式下设置页的「图片占用」显示为 0（云存储容量请在控制台查看）
- 金额输入保留两位小数，不做多币种

## 相关项目

| 版本 | 说明 |
|---|---|
| [qingji](https://github.com/jimmyfj832/qingji) | Web 版，浏览器直接打开，账户密码体系 |
| qingji-miniprogram | 本仓库，微信小程序版 |

两个版本分类体系、数据字段完全一致，CSV 可互相导入。

## 审核提示

- 类目建议：工具 → 效率 / 记账。个人主体可选，无需特殊资质（**以微信官方最新类目规则为准**）
- 当前未调用任何隐私接口（不取手机号、位置、用户信息），无需配置用户隐私保护指引
- `wx.chooseMedia` 调用相册/相机属于系统权限授权，首次使用会弹系统授权框，属正常行为
- 若后续加入手机号登录、定位、订阅消息等，需先在公众平台配置隐私保护指引与对应接口声明

## License

[MIT](./LICENSE) © 2026 jimmyfj832
