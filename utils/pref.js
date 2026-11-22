/**
 * 本地偏好
 * ------------------------------------------------------------------
 * 只存"使用习惯"这类轻量设置，不进数据层。
 * 读取一律带 try/catch，存储异常时返回默认值，不影响主流程。
 * ------------------------------------------------------------------
 */

const KEY = 'qj_pref_v1'

function readAll() {
  try {
    const v = wx.getStorageSync(KEY)
    return v && typeof v === 'object' ? v : {}
  } catch (e) {
    return {}
  }
}

function writeAll(obj) {
  try {
    wx.setStorageSync(KEY, obj)
  } catch (e) {
    /* 偏好写失败静默忽略，不能影响记账 */
  }
}

/**
 * 取上次用的分类
 * @param {'in'|'out'} type
 * @returns {string} 分类名，没有则空串
 */
function getLastCat(type) {
  const all = readAll()
  const map = all.lastCat || {}
  return map[type] || ''
}

/**
 * 记住本次用的分类
 * @param {'in'|'out'} type
 * @param {string} name
 */
function setLastCat(type, name) {
  if (!type || !name) return
  const all = readAll()
  const map = Object.assign({}, all.lastCat)
  map[type] = name
  all.lastCat = map
  writeAll(all)
}

module.exports = {
  getLastCat,
  setLastCat
}
