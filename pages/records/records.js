const db = require('../../utils/db')
const L = require('../../services/ledger')
const util = require('../../utils/util')
const { EXPENSE_CATS, INCOME_CATS } = require('../../utils/constants')

Page({
  data: {
    ym: '',
    monthText: '',
    maxMonth: '',
    filterType: 'all',
    catNames: ['全部分类'],
    catIdx: 0,
    keyword: '',

    groups: [],
    count: 0,
    allCount: 0,
    hasFilter: false,
    totalOutText: '0.00',
    totalInText: '0.00',
    loading: true
  },

  onLoad() {
    const names = ['全部分类']
    EXPENSE_CATS.forEach(function (c) { names.push(c.name) })
    INCOME_CATS.forEach(function (c) {
      if (names.indexOf(c.name) < 0) names.push(c.name)
    })

    const now = util.currentMonth()
    this.setData({
      ym: now,
      monthText: util.monthLabel(now),
      maxMonth: now,
      catNames: names
    })
  },

  onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 1 })
    this.load()
  },

  onPullDownRefresh() {
    this.load(function () {
      wx.stopPullDownRefresh()
    })
  },

  onUnload() {
    // 清理搜索防抖定时器，避免离开页面后仍触发 setData
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  },

  onMonth(e) {
    const ym = e.detail.value
    this.setData({ ym: ym, monthText: util.monthLabel(ym) })
    this.load()
  },

  onType(e) {
    const t = e.currentTarget.dataset.t
    if (t === this.data.filterType) return
    this.setData({ filterType: t })
    this.load()
  },

  onCat(e) {
    this.setData({ catIdx: Number(e.detail.value) })
    this.load()
  },

  onSearch(e) {
    const kw = e.detail.value
    this.setData({ keyword: kw })
    if (this._timer) clearTimeout(this._timer)
    const that = this
    this._timer = setTimeout(function () {
      that.load()
    }, 200)
  },

  clearSearch() {
    this.setData({ keyword: '' })
    this.load()
  },

  /** 空态出口：从未记账时直接去记第一笔 */
  goAdd() {
    wx.navigateTo({ url: '/pages/edit/edit' })
  },

  /** 空态出口：筛选无结果时清空全部条件并回到当前月 */
  resetFilter() {
    const now = util.currentMonth()
    this.setData({
      filterType: 'all',
      catIdx: 0,
      keyword: '',
      ym: now,
      monthText: util.monthLabel(now)
    })
    this.load()
  },

  async load(done) {
    const ym = this.data.ym
    const type = this.data.filterType
    const catName = this.data.catNames[this.data.catIdx]
    const kw = (this.data.keyword || '').trim()

    try {
      const all = await db.listRecords()
      let list = L.inMonth(all, ym)

      if (type !== 'all') {
        list = list.filter(function (r) { return r.type === type })
      }
      if (this.data.catIdx > 0) {
        list = list.filter(function (r) { return r.cat === catName })
      }
      if (kw) {
        const lower = kw.toLowerCase()
        list = list.filter(function (r) {
          const note = String(r.note || '').toLowerCase()
          const cat = String(r.cat || '').toLowerCase()
          return note.indexOf(lower) >= 0 || cat.indexOf(lower) >= 0
        })
      }

      // 缓存一份，供点击时取图片列表
      const map = {}
      list.forEach(function (r) { map[r.id] = r })
      this._map = map

      const sum = L.summarize(list)

      this.setData({
        groups: L.groupByDate(list),
        count: list.length,
        allCount: all.length,
        // 类型/分类/关键词任一非默认，才算「有筛选」；月份切换不算筛选
        hasFilter: type !== 'all' || this.data.catIdx > 0 || !!kw,
        totalOutText: util.money(sum.expense),
        totalInText: util.money(sum.income),
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: '数据读取失败', icon: 'none' })
    }

    if (typeof done === 'function') done()
  },

  onRec(e) {
    const id = e.currentTarget.dataset.id
    const rec = this._map && this._map[id]
    if (!rec) return

    const items = ['编辑']
    const imgs = rec.imgs || []
    if (imgs.length) items.push('查看凭证（' + imgs.length + '）')
    items.push('删除')

    const that = this
    wx.showActionSheet({
      itemList: items,
      success: function (res) {
        const label = items[res.tapIndex]
        if (label === '编辑') {
          wx.navigateTo({ url: '/pages/edit/edit?id=' + id })
        } else if (label.indexOf('查看凭证') === 0) {
          wx.previewImage({ urls: imgs, current: imgs[0] })
        } else if (label === '删除') {
          that.confirmDelete(id)
        }
      },
      fail: function () {}
    })
  },

  confirmDelete(id) {
    const that = this
    wx.showModal({
      title: '删除这笔记录？',
      content: '删除后无法恢复，关联的凭证图片也会一并清理。',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: function (res) {
        if (!res.confirm) return
        db.deleteRecord(id).then(function () {
          wx.showToast({ title: '已删除', icon: 'none' })
          that.load()
        })
      }
    })
  }
})
