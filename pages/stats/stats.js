const db = require('../../utils/db')
const L = require('../../services/ledger')
const util = require('../../utils/util')

Page({
  data: {
    ym: '',
    monthText: '',

    statType: 'out',
    cats: [],
    catTotalText: '¥0.00',

    expenseText: '0.00',
    incomeText: '0.00',
    avgText: '0.00',
    countText: '0 笔',

    trendRows: [],
    trendMaxText: ''
  },

  onLoad() {
    const ym = util.currentMonth()
    this.setData({ ym: ym, monthText: util.monthLabel(ym) })
  },

  onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 3 })
    this.load()
  },

  onPullDownRefresh() {
    this.load(function () {
      wx.stopPullDownRefresh()
    })
  },

  onStatType(e) {
    const t = e.currentTarget.dataset.t
    if (t === this.data.statType) return
    this.setData({ statType: t })
    this.applyCats()
  },

  async load(done) {
    try {
      const all = await db.listRecords()
      const month = L.inMonth(all, this.data.ym)
      const sum = L.summarize(month)

      const tr = L.trend(all, 6)
      // 月均支出（近 6 个月）
      let sumExp = 0
      let usedMonths = 0
      tr.rows.forEach(function (r) {
        sumExp += r.expense
        if (r.income > 0 || r.expense > 0) usedMonths += 1
      })
      const avg = usedMonths > 0 ? sumExp / usedMonths : 0

      this._all = all
      this._month = month

      this.setData({
        expenseText: util.money(sum.expense),
        incomeText: util.money(sum.income),
        avgText: util.money(avg),
        countText: month.length + ' 笔',
        trendRows: tr.rows,
        trendMaxText: tr.max > 0 ? '峰值 ' + util.fmt(tr.max) : '暂无数据'
      })

      this.applyCats()
    } catch (e) {
      wx.showToast({ title: '数据读取失败', icon: 'none' })
    }
    if (typeof done === 'function') done()
  },

  /** 空态出口：去记一笔 */
  goAdd() {
    wx.navigateTo({ url: '/pages/edit/edit' })
  },

  applyCats() {
    const type = this.data.statType
    const month = this._month || []
    const cats = L.catTotals(month, type)
    const sum = L.summarize(month)
    this.setData({
      cats: cats,
      catTotalText: util.fmt(type === 'in' ? sum.income : sum.expense)
    })
  }
})
