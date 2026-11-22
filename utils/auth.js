/**
 * 身份层
 * ------------------------------------------------------------------
 * 当前实现：本地静默身份（设备匿名 ID）
 *   首次进入小程序生成一个稳定的 uid 并持久化，之后所有数据按该 uid 隔离。
 *   用户完全无感，不需要注册登录。
 *
 * 为什么不用 openid：
 *   openid 必须由服务端（或云函数）用 wx.login 返回的 code 换取，
 *   前端拿不到也不该拿（前端存 session_key 会被伪造，属于安全红线）。
 *
 * 后续接云开发时要做的事（只改这一个文件 + utils/db.js）：
 *   1. 部署云函数 login，内部用 cloud.getWXContext().OPENID 返回 openid
 *   2. 这里把 getUid() 换成 await callFunction({ name: 'login' }) 拿到的 openid
 *   3. db.js 里 MODE 改为 'cloud'
 *   业务层（pages / services）完全不用改。
 * ------------------------------------------------------------------
 */

const { STORAGE } = require('./constants')
const { uid } = require('./util')

const LOGIN_MODE = 'local' // 'local' | 'cloud'

let cachedUid = ''

/** 取当前身份 uid；本地模式为设备 ID */
function getUid() {
  if (cachedUid) return cachedUid

  let id = ''
  try {
    id = wx.getStorageSync(STORAGE.DEVICE)
  } catch (e) {
    id = ''
  }

  if (!id) {
    id = LOGIN_MODE === 'cloud' ? '' : 'dev_' + uid()
    if (id) {
      try {
        wx.setStorageSync(STORAGE.DEVICE, id)
      } catch (e) {
        // 存储不可用时退化为内存态，不阻塞使用
      }
    }
  }

  cachedUid = id
  return id
}

/** 昵称等轻量资料 */
function getProfile() {
  const key = STORAGE.PROFILE + getUid()
  let p = null
  try {
    p = wx.getStorageSync(key)
  } catch (e) {
    p = null
  }
  if (!p || typeof p !== 'object') {
    p = { nick: '我' }
  }
  return p
}

function setProfile(patch) {
  const key = STORAGE.PROFILE + getUid()
  const next = Object.assign({}, getProfile(), patch || {})
  try {
    wx.setStorageSync(key, next)
  } catch (e) {
    // 忽略写入失败
  }
  return next
}

/** 页面/服务层统一入口 */
function ensureLogin() {
  const profile = getProfile()
  return {
    uid: getUid(),
    nick: profile.nick || '我',
    mode: LOGIN_MODE
  }
}

module.exports = {
  LOGIN_MODE,
  getUid,
  getProfile,
  setProfile,
  ensureLogin
}
