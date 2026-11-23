const db = require('../../utils/db')
const auth = require('../../utils/auth')
const L = require('../../services/ledger')
const util = require('../../utils/util')

const RECENT_LIMIT = 5

Page({
  data: {
    ym: '',
    monthText: '',
    canNext: false,

    balanceText: '¥0.00',
    balanceNeg: false,
    income: '0.00',
    expense: '0.00',
    cmpIncome: '',
    cmpIncomeDir: 'none',
    cmpExpense: '',
    cmpExpenseDir: 'none',

    budget: { set: false, text: '', pct: 0, barWidth: 0, over: false, leftText: '' },

    donut: [],
    donutTotal: 0,
    totalOutText: '¥0.00',
    hasData: false,

    recent: [],
    isFirstUse: false,
    nick: '我',
    loading: true
  },

  onLoad() {
    const ym = util.currentMonth()
    this.setData({
      ym: ym,
      monthText: util.monthLabel(ym),
      canNext: false
    })
  },

  onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 0 })
    this.load()
  },

  onPullDownRefresh() {
    const that = this
    this.load(function () {
      wx.stopPullDownRefresh()
    })
  },

  /** 切月：-1 上一月，+1 下一月（不允许超过当前月） */
  prevMonth() {
    const ym = util.shiftMonth(this.data.ym, -1)
    this.switchMonth(ym)
  },

  nextMonth() {
    if (!this.data.canNext) return
    const ym = util.shiftMonth(this.data.ym, 1)
    this.switchMonth(ym)
  },

  switchMonth(ym) {
    const now = util.currentMonth()
    this.setData({
      ym: ym,
      monthText: util.monthLabel(ym),
      canNext: ym < now
    })
    this.load()
  },

  async load(done) {
    const ym = this.data.ym
    try {
      const all = await db.listRecords()
      const month = L.inMonth(all, ym)
      const prev = L.inMonth(all, util.shiftMonth(ym, -1))
      const sum = L.summarize(month)
      const prevSum = L.summarize(prev)
      const budgetVal = await db.getBudget()

      const cIn = L.compareText(sum.income, prevSum.income)
      const cOut = L.compareText(sum.expense, prevSum.expense)
      const cats = L.catTotals(month, 'out')

      const recent = month.slice(0, RECENT_LIMIT).map(L.decorate)

      this.setData({
        balanceText: (sum.balance < 0 ? '−¥' : '¥') + util.money(sum.balance),
        balanceNeg: sum.balance < 0,
        income: util.money(sum.income),
        expense: util.money(sum.expense),
        cmpIncome: cIn.text,
        cmpIncomeDir: cIn.dir,
        cmpExpense: cOut.text,
        cmpExpenseDir: cOut.dir,
        budget: L.budgetState(budgetVal, sum.expense),
        donut: cats,
        donutTotal: sum.expense,
        totalOutText: util.fmt(sum.expense),
        hasData: month.length > 0,
        recent: recent,
        // 全库一条记录都没有 → 首次使用，展示顶部引导卡
        isFirstUse: all.length === 0,
        nick: auth.getProfile().nick || '我',
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: '数据读取失败', icon: 'none' })
    }
    if (typeof done === 'function') done()
  },

  goRecords() {
    wx.switchTab({ url: '/pages/records/records' })
  },

  goStats() {
    wx.switchTab({ url: '/pages/stats/stats' })
  },

  goSettings() {
    wx.switchTab({ url: '/pages/settings/settings' })
  },

  goEdit(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset.id
    wx.navigateTo({
      url: id ? '/pages/edit/edit?id=' + id : '/pages/edit/edit'
    })
  }
})
