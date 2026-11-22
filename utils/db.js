/**
 * 数据层（相当于"后端"）
 * ------------------------------------------------------------------
 * 对外导出的每个方法都是 async（返回 Promise），页面只依赖这套契约。
 * 现在用本地实现（wx.storage + 小程序文件系统）；
 * 后续接云开发时把 MODE 改成 'cloud'，页面代码一行不用动。
 *
 * 统一契约：
 *   listRecords()            -> Promise<Record[]>
 *   getRecord(id)            -> Promise<Record|null>
 *   addRecord(r)             -> Promise<Record>
 *   updateRecord(r)          -> Promise<Record>
 *   deleteRecord(id)         -> Promise<void>
 *   getBudget()              -> Promise<number>
 *   setBudget(n)             -> Promise<number>
 *   clearRecords()           -> Promise<void>
 *   saveImages(tempPaths)    -> Promise<string[]>   批量落盘，返回持久化路径
 *   removeImages(paths)      -> Promise<void>       清理图片文件
 *   imageUsage()             -> Promise<{count,bytes}>
 *
 * Record 结构：
 *   { id, type:'in'|'out', cat, amount:Number, note, date:'YYYY-MM-DD',
 *     imgs:string[], created:Number }
 * ------------------------------------------------------------------
 */

const { STORAGE } = require('./constants')
const { uid } = require('./util')
const auth = require('./auth')

const MODE = 'local' // 'local' | 'cloud'

/* ================================================================
   本地实现
   ================================================================ */

function readKey(key, def) {
  try {
    const v = wx.getStorageSync(key)
    if (v === '' || v === null || v === undefined) return def
    return v
  } catch (e) {
    return def
  }
}

function writeKey(key, val) {
  try {
    wx.setStorageSync(key, val)
    return true
  } catch (e) {
    wx.showToast({ title: '本地存储写入失败', icon: 'none' })
    return false
  }
}

function recKey() {
  return STORAGE.REC + auth.getUid()
}

function budgetKey() {
  return STORAGE.BUDGET + auth.getUid()
}

/** 兼容老数据：把单个 imgId 归一到 imgs 数组 */
function normalize(r) {
  const out = Object.assign({}, r)
  if (!Array.isArray(out.imgs)) {
    out.imgs = out.imgId ? [out.imgId] : []
  }
  delete out.imgId
  out.amount = Number(out.amount) || 0
  return out
}

function sortRecords(list) {
  return list.sort(function (a, b) {
    if (a.date === b.date) return (b.created || 0) - (a.created || 0)
    return a.date < b.date ? 1 : -1
  })
}

const local = {
  async listRecords() {
    const raw = readKey(recKey(), [])
    const list = Array.isArray(raw) ? raw.map(normalize) : []
    return sortRecords(list)
  },

  async getRecord(id) {
    const list = await local.listRecords()
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i]
    }
    return null
  },

  async addRecord(r) {
    const list = await local.listRecords()
    const rec = normalize(Object.assign({}, r, {
      id: uid(),
      created: Date.now()
    }))
    list.unshift(rec)
    writeKey(recKey(), list)
    return rec
  },

  async updateRecord(r) {
    const list = await local.listRecords()
    let saved = null
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === r.id) {
        list[i] = normalize(Object.assign({}, list[i], r))
        saved = list[i]
        break
      }
    }
    if (saved) writeKey(recKey(), list)
    return saved
  },

  async deleteRecord(id) {
    const list = await local.listRecords()
    let target = null
    const next = []
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) target = list[i]
      else next.push(list[i])
    }
    writeKey(recKey(), next)
    if (target && target.imgs && target.imgs.length) {
      await local.removeImages(target.imgs)
    }
  },

  async getBudget() {
    const v = readKey(budgetKey(), 0)
    return Number(v) || 0
  },

  async setBudget(n) {
    const v = Number(n) || 0
    writeKey(budgetKey(), v)
    return v
  },

  async clearRecords() {
    const list = await local.listRecords()
    const paths = []
    list.forEach(function (r) {
      if (r.imgs) paths.push.apply(paths, r.imgs)
    })
    writeKey(recKey(), [])
    if (paths.length) await local.removeImages(paths)
  },

  /** 压缩单张图片，失败则返回原路径（不阻塞业务流程） */
  compress(tempPath) {
    return new Promise(function (resolve) {
      if (typeof wx.compressImage !== 'function') return resolve(tempPath)
      wx.compressImage({
        src: tempPath,
        quality: 70,
        success: function (res) { resolve(res.tempFilePath) },
        fail: function () { resolve(tempPath) }
      })
    })
  },

  /** 临时文件 → 持久化文件，返回持久化路径 */
  saveOne(tempPath) {
    return new Promise(function (resolve) {
      const fs = wx.getFileSystemManager()
      const dot = tempPath.lastIndexOf('.')
      const ext = dot >= 0 ? tempPath.slice(dot + 1) : 'jpg'
      const safeExt = /^(jpg|jpeg|png|webp|gif)$/i.test(ext) ? ext : 'jpg'
      const target = wx.env.USER_DATA_PATH + '/qj_' + uid() + '.' + safeExt

      fs.saveFile({
        tempFilePath: tempPath,
        filePath: target,
        success: function (res) { resolve(res.savedFilePath || target) },
        fail: function () { resolve('') }
      })
    })
  },

  /** 批量落盘：返回数组与入参一一对应，失败的位置为 '' */
  async saveImages(tempPaths) {
    const out = []
    const list = tempPaths || []
    for (let i = 0; i < list.length; i++) {
      const compressed = await local.compress(list[i])
      const saved = await local.saveOne(compressed)
      out.push(saved || '')
    }
    return out
  },

  removeImages(paths) {
    return new Promise(function (resolve) {
      const list = paths || []
      if (!list.length) return resolve()
      const fs = wx.getFileSystemManager()
      let left = list.length
      list.forEach(function (p) {
        // 只删自己管理的文件，避免误删
        if (!p || p.indexOf('qj_') < 0) {
          left -= 1
          if (left === 0) resolve()
          return
        }
        fs.unlink({
          filePath: p,
          complete: function () {
            left -= 1
            if (left === 0) resolve()
          }
        })
      })
    })
  },

  /** 统计图片目录占用，用于设置页展示 */
  imageUsage() {
    return new Promise(function (resolve) {
      const fs = wx.getFileSystemManager()
      fs.readdir({
        dirPath: wx.env.USER_DATA_PATH,
        success: function (res) {
          const files = (res.files || []).filter(function (f) {
            return f.indexOf('qj_') === 0
          })
          let bytes = 0
          let left = files.length
          if (!left) return resolve({ count: 0, bytes: 0 })
          files.forEach(function (f) {
            fs.stat({
              path: wx.env.USER_DATA_PATH + '/' + f,
              success: function (st) {
                bytes += (st.stats && st.stats.size) || 0
                left -= 1
                if (left === 0) resolve({ count: files.length, bytes: bytes })
              },
              fail: function () {
                left -= 1
                if (left === 0) resolve({ count: files.length, bytes: bytes })
              }
            })
          })
        },
        fail: function () { resolve({ count: 0, bytes: 0 }) }
      })
    })
  }
}

/* ================================================================
   云开发实现（骨架）
   ----------------------------------------------------------------
   接入步骤：
   1. app.js onLaunch 里 wx.cloud.init({ env: '你的环境ID', traceUser: true })
   2. 云数据库建集合：records（_openid 自动写入）、configs
      records 字段：type cat amount note date imgs[] created
      安全规则建议：{"read": "doc._openid == auth.openid", "write": "doc._openid == auth.openid"}
   3. 云存储建目录 receipts/，图片上传后拿到 fileID
   4. 部署云函数 qingji（action 路由），返回 { ok, data }
   5. 把上面 MODE 改成 'cloud'
   ================================================================ */

function cloudCall(action, data) {
  return wx.cloud
    .callFunction({ name: 'qingji', data: Object.assign({ action: action }, data || {}) })
    .then(function (res) {
      const r = res && res.result
      if (!r || r.ok !== true) {
        throw new Error((r && r.msg) || '云端请求失败')
      }
      return r.data
    })
}

const cloud = {
  listRecords() {
    return cloudCall('list').then(function (rows) {
      return sortRecords((rows || []).map(normalize))
    })
  },

  getRecord(id) {
    return cloudCall('get', { id: id }).then(function (row) {
      return row ? normalize(row) : null
    })
  },

  addRecord(r) {
    const payload = Object.assign({}, r, { created: Date.now() })
    return cloudCall('add', payload).then(normalize)
  },

  updateRecord(r) {
    return cloudCall('update', r).then(normalize)
  },

  deleteRecord(id) {
    return cloudCall('remove', { id: id }).then(function () {})
  },

  getBudget() {
    return cloudCall('getBudget').then(function (v) { return Number(v) || 0 })
  },

  setBudget(n) {
    return cloudCall('setBudget', { budget: Number(n) || 0 }).then(function () {
      return Number(n) || 0
    })
  },

  clearRecords() {
    return cloudCall('clear').then(function () {})
  },

  saveImages(tempPaths) {
    const list = tempPaths || []
    const tasks = list.map(function (p) {
      const dot = p.lastIndexOf('.')
      const ext = dot >= 0 ? p.slice(dot + 1) : 'jpg'
      const cloudPath = 'receipts/' + uid() + '.' + ext
      return wx.cloud
        .uploadFile({ cloudPath: cloudPath, filePath: p })
        .then(function (res) { return res.fileID || '' })
        .catch(function () { return '' })
    })
    return Promise.all(tasks)
  },

  removeImages(paths) {
    const list = (paths || []).filter(function (p) {
      return p && p.indexOf('cloud://') === 0
    })
    if (!list.length) return Promise.resolve()
    return wx.cloud.deleteFile({ fileList: list }).then(function () {}).catch(function () {})
  },

  imageUsage() {
    return Promise.resolve({ count: 0, bytes: 0 })
  }
}

/* ================================================================
   对外导出
   ================================================================ */

const impl = MODE === 'cloud' ? cloud : local

module.exports = {
  MODE: MODE,
  listRecords: impl.listRecords,
  getRecord: impl.getRecord,
  addRecord: impl.addRecord,
  updateRecord: impl.updateRecord,
  deleteRecord: impl.deleteRecord,
  getBudget: impl.getBudget,
  setBudget: impl.setBudget,
  clearRecords: impl.clearRecords,
  saveImages: impl.saveImages,
  removeImages: impl.removeImages,
  imageUsage: impl.imageUsage
}
