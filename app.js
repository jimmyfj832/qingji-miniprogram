const auth = require('./utils/auth')

App({
  globalData: {
    user: null
  },

  onLaunch() {
    // 本地模式：静默身份，无需登录
    this.globalData.user = auth.ensureLogin()

    // 接云开发后在这里初始化（同时把 utils/db.js 的 MODE 改为 'cloud'）：
    // if (wx.cloud) {
    //   wx.cloud.init({ env: '你的环境ID', traceUser: true })
    // }
  }
})
