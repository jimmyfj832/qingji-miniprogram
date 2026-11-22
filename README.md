# 轻记 · 记账小程序

由 Web 版 [qingji](../qingji) 移植的微信原生小程序，功能与视觉保持一致。

## 功能

| 模块 | 能力 |
|---|---|
| 总览 | 月度收支结余、环比、预算进度、支出构成环形图、最近记录 |
| 明细 | 按月/类型/分类筛选、备注搜索、按日期分组、点击编辑/看凭证/删除 |
| 统计 | 近 6 个月收支趋势柱状图、分类排行与占比 |
| 记一笔 | 支出/收入切换、9+5 个分类、金额、日期、备注、最多 5 张凭证图片 |
| 设置 | 昵称、月度预算、导出 CSV、清空数据、存储占用查看 |

## 目录结构

```
qingji-miniprogram/
├── app.js / app.json / app.wxss      # 入口、全局配置、全局样式与设计变量
├── project.config.json               # 开发者工具项目配置
├── sitemap.json
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
└── utils/
    ├── constants.js                  # 分类与存储键
    ├── util.js                       # 金额/日期/颜色格式化
    ├── auth.js                       # 身份层（本地静默登录）
    └── db.js                         # 数据层（本地实现 + 云开发骨架）
```

分层约定：**pages 只调用 services 与 db**，不直接碰 storage；db 的所有方法都是 async，方便后续换云端实现。

## 运行

1. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开工具 → 导入项目 → 选择本目录
3. AppID 填自己的，或点「使用测试号」；`project.config.json` 里预置的是 `touristappid`（游客模式）
4. 编译即可，无需任何后端或依赖安装

## 数据存储方案

当前为**本地模式**：

- 账目 / 预算：`wx.setStorageSync`，按设备匿名 ID 前缀隔离
- 凭证图片：`wx.compressImage` 压缩后 `FileSystemManager.saveFile` 存入小程序文件系统（`USER_DATA_PATH`）

**身份说明**：小程序 openid 必须由服务端用 `wx.login` 的 code 换取，前端拿不到（前端存 session_key 属安全红线）。因此本地版用**设备匿名 ID** 做静默身份，用户无感、无需注册登录。换手机或清除小程序数据即视为新身份。

### 后续切换云开发

数据层已做适配隔离，切换只改两个文件：

1. `app.js` 的 `onLaunch` 里放开 `wx.cloud.init({ env: '你的环境ID' })`
2. `utils/db.js` 顶部 `const MODE = 'cloud'`

云函数契约（`action` 路由）见 `utils/db.js` 内注释，需实现：`list / get / add / update / remove / getBudget / setBudget / clear`。

云数据库集合 `records` 建议安全规则：

```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

## 已知限制

- 本地模式不跨设备同步，单向存储；建议引导用户定期导出 CSV 备份
- `FileSystemManager.saveFile` 保存目录有容量上限（约 10MB），按压缩后约 100KB/张估算，可存 100 张左右；超出后保存会失败并自动降级为不存图
- 金额输入保留两位小数，不做多币种

## 审核提示

- 类目建议：工具 → 效率 / 记账。个人主体可选，无需特殊资质（**以微信官方最新类目规则为准**）
- 当前未调用任何隐私接口（不取手机号、位置、用户信息），无需配置用户隐私保护指引
- `wx.chooseMedia` 调用相册/相机属于系统权限授权，首次使用会弹系统授权框，属正常行为
- 若后续加入手机号登录、定位、订阅消息等，需先在公众平台配置隐私保护指引与对应接口声明
