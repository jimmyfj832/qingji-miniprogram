const auth = require('./utils/auth')
const cfg = require('./utils/config')

App({
  globalData: {
    user: null
  },

  onLaunch() {
    // 静默身份：本地模式用设备匿名 ID，云模式仍以此做本地缓存标识
    this.globalData.user = auth.ensureLogin()

    // 云开发模式才初始化；local 模式下完全不碰云，保持开箱即用
    if (cfg.MODE === 'cloud' && cfg.CLOUD_ENV) {
      if (!wx.cloud) {
        console.error('[qingji] 当前基础库不支持云开发，已回落本地模式')
        return
      }
      wx.cloud.init({
        env: cfg.CLOUD_ENV,
        traceUser: true
      })
    }
  }
})
