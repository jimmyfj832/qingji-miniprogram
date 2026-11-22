const db = require('../../utils/db')
const util = require('../../utils/util')
const pref = require('../../utils/pref')
const { catsOf } = require('../../utils/constants')

const MAX_IMGS = 5

Page({
  data: {
    id: '',
    type: 'out',
    cats: catsOf('out'),
    cat: '',
    amount: '',
    date: '',
    today: '',
    note: '',
    imgs: [],
    maxImgs: MAX_IMGS,
    saving: false,
    autoFocus: false,
    isEdit: false
  },

  onLoad(options) {
    const today = util.todayStr()
    const id = (options && options.id) || ''

    this.setData({
      today: today,
      date: today,
      cats: catsOf('out'),
      // 新建时回填上次用过的分类，编辑时用记录自己的分类
      cat: id ? '' : this.pickLastCat('out'),
      id: id,
      isEdit: !!id
    })

    wx.setNavigationBarTitle({ title: id ? '编辑记录' : '记一笔' })

    if (id) {
      this.loadRecord(id)
    } else {
      const that = this
      setTimeout(function () {
        that.setData({ autoFocus: true })
      }, 350)
    }
  },

  /** 取该类型上次用的分类；分类已被删除或不存在则返回空串 */
  pickLastCat(type) {
    const name = pref.getLastCat(type)
    if (!name) return ''
    const cats = catsOf(type)
    for (let i = 0; i < cats.length; i++) {
      if (cats[i].name === name) return name
    }
    return ''
  },

  async loadRecord(id) {
    const rec = await db.getRecord(id)
    if (!rec) {
      wx.showToast({ title: '记录不存在', icon: 'none' })
      return
    }
    const imgs = (rec.imgs || []).map(function (p) {
      return { path: p, isNew: false }
    })
    this._originImgs = (rec.imgs || []).slice()
    this.setData({
      type: rec.type,
      cats: catsOf(rec.type),
      cat: rec.cat,
      amount: String(rec.amount),
      date: rec.date,
      note: rec.note || '',
      imgs: imgs
    })
  },

  /* ---------- 类型 ---------- */
  onType(e) {
    const type = e.currentTarget.dataset.t
    if (type === this.data.type) return
    this.setData({
      type: type,
      cats: catsOf(type),
      // 新建时切换类型也跟着回填该类型上次的分类；编辑时清空让用户重选
      cat: this.data.isEdit ? '' : this.pickLastCat(type)
    })
  },

  onCat(e) {
    this.setData({ cat: e.currentTarget.dataset.n })
  },

  /* ---------- 金额 ---------- */
  onAmount(e) {
    const v = util.sanitizeAmount(e.detail.value)
    this.setData({ amount: v })
    return v
  },

  onDate(e) {
    this.setData({ date: e.detail.value })
  },

  onNote(e) {
    this.setData({ note: e.detail.value })
  },

  /* ---------- 图片 ---------- */
  chooseImg() {
    const left = MAX_IMGS - this.data.imgs.length
    if (left <= 0) {
      wx.showToast({ title: '最多 ' + MAX_IMGS + ' 张', icon: 'none' })
      return
    }

    const that = this
    wx.chooseMedia({
      count: left,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const next = that.data.imgs.slice()
        ;(res.tempFiles || []).forEach(function (f) {
          next.push({ path: f.tempFilePath, isNew: true })
        })
        that.setData({ imgs: next })
      },
      fail() {}
    })
  },

  previewImg(e) {
    const idx = Number(e.currentTarget.dataset.i)
    const urls = this.data.imgs.map(function (i) { return i.path })
    wx.previewImage({ urls: urls, current: urls[idx] })
  },

  delImg(e) {
    const idx = Number(e.currentTarget.dataset.i)
    const next = this.data.imgs.slice()
    const removed = next.splice(idx, 1)[0]
    this.setData({ imgs: next })

    // 已落盘的老图片：等保存成功后再真正删除，避免取消编辑导致图片丢失
    if (removed && !removed.isNew) {
      this._pendingRemove = this._pendingRemove || []
      this._pendingRemove.push(removed.path)
    }
  },

  /* ---------- 保存 ---------- */
  async onSave() {
    if (this.data.saving) return

    const amount = Number(this.data.amount)
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入金额', icon: 'none' })
      return
    }

    const cat = this.data.cat || (this.data.type === 'in' ? '其他' : '其他')
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中', mask: true })

    try {
      // 1. 新图落盘（压缩 → 存入小程序文件系统）
      const newPaths = []
      this.data.imgs.forEach(function (i) {
        if (i.isNew) newPaths.push(i.path)
      })

      let saved = []
      if (newPaths.length) {
        const results = await db.saveImages(newPaths)
        saved = results.filter(function (p) { return !!p })
      }

      // 2. 拼出最终图片列表：老图（保留的）+ 新图（落盘后）
      const keepOld = []
      this.data.imgs.forEach(function (i) {
        if (!i.isNew) keepOld.push(i.path)
      })
      const finalImgs = keepOld.concat(saved)

      const payload = {
        type: this.data.type,
        cat: cat,
        amount: amount,
        note: (this.data.note || '').trim(),
        date: this.data.date || util.todayStr(),
        imgs: finalImgs
      }

      // 3. 写入
      if (this.data.id) {
        payload.id = this.data.id
        await db.updateRecord(payload)
      } else {
        await db.addRecord(payload)
        // 仅新建时记住分类，编辑老账不污染使用习惯
        pref.setLastCat(this.data.type, cat)
      }

      // 4. 清理被移除的旧图
      if (this._pendingRemove && this._pendingRemove.length) {
        await db.removeImages(this._pendingRemove)
        this._pendingRemove = []
      }

      wx.hideLoading()
      wx.showToast({ title: this.data.id ? '已保存' : '已记账', icon: 'success' })

      const that = this
      setTimeout(function () {
        that.goBack()
      }, 420)
    } catch (e) {
      wx.hideLoading()
      this.setData({ saving: false })
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  /* ---------- 删除 ---------- */
  onDelete() {
    const that = this
    wx.showModal({
      title: '删除这笔记录？',
      content: '删除后不可恢复，凭证图片会一并清理。',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success(res) {
        if (!res.confirm) return
        db.deleteRecord(that.data.id).then(function () {
          wx.showToast({ title: '已删除', icon: 'none' })
          setTimeout(function () { that.goBack() }, 350)
        })
      }
    })
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.switchTab({ url: '/pages/dashboard/dashboard' })
    }
  }
})
