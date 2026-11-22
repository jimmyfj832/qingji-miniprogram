const db = require('../../utils/db')
const auth = require('../../utils/auth')
const L = require('../../services/ledger')
const util = require('../../utils/util')

const VERSION = '1.0.0'

// 数据模式由 utils/config.js 决定，这里只做展示
const IS_CLOUD = db.MODE === 'cloud'

function sizeText(bytes) {
  const b = Number(bytes) || 0
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB'
  return (b / 1024 / 1024).toFixed(1) + ' MB'
}

Page({
  data: {
    nick: '我',
    avatarText: '我',
    budgetSet: false,
    budgetRaw: '',
    budgetText: '未设置',
    recordCount: 0,
    totalExpense: '0.00',
    totalIncome: '0.00',
    imgCount: 0,
    imgSize: '0 B',
    version: VERSION,

    // 数据模式展示（云模式不再说"保存在本机"，避免误导）
    isCloud: IS_CLOUD,
    modeTitle: IS_CLOUD ? '云端账本' : '本地账本',
    modeSub: IS_CLOUD ? '多设备自动同步' : '数据保存在本机',

    modalShow: false,
    modalType: '',
    modalTitle: '',
    modalValue: '',
    modalPlaceholder: '',
    modalHint: '',
    modalKeyboard: 'number'
  },

  onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 4 })
    this.load()
  },

  onPullDownRefresh() {
    this.load(function () {
      wx.stopPullDownRefresh()
    })
  },

  async load(done) {
    try {
      const all = await db.listRecords()
      const sum = L.summarize(all)
      const budget = await db.getBudget()
      const usage = await db.imageUsage()

      const nick = auth.getProfile().nick || '我'
      this.setData({
        nick: nick,
        avatarText: nick.slice(0, 1),
        budgetSet: budget > 0,
        budgetRaw: budget > 0 ? String(budget) : '',
        budgetText: budget > 0 ? util.fmt(budget) : '未设置',
        recordCount: all.length,
        totalExpense: util.money(sum.expense),
        totalIncome: util.money(sum.income),
        imgCount: usage.count || 0,
        imgSize: sizeText(usage.bytes)
      })
    } catch (e) {
      wx.showToast({ title: '数据读取失败', icon: 'none' })
    }
    if (typeof done === 'function') done()
  },

  /* ---------- 预算 ---------- */
  openBudget() {
    this.setData({
      modalShow: true,
      modalType: 'budget',
      modalTitle: '设置月度预算',
      modalValue: this.data.budgetRaw || '',
      modalPlaceholder: '例如 5000',
      modalHint: '留空或填 0 表示不设预算',
      modalKeyboard: 'digit'
    })
  },

  /* ---------- 昵称 ---------- */
  openNick() {
    this.setData({
      modalShow: true,
      modalType: 'nick',
      modalTitle: '修改昵称',
      modalValue: this.data.nick,
      modalPlaceholder: '给自己起个名字',
      modalHint: '只在本机显示，不影响数据',
      modalKeyboard: 'text'
    })
  },

  closeModal() {
    this.setData({ modalShow: false })
  },

  onModalInput(e) {
    this.setData({ modalValue: e.detail.value })
  },

  async confirmModal() {
    const type = this.data.modalType
    const val = this.data.modalValue

    if (type === 'budget') {
      const num = Number(util.sanitizeAmount(val)) || 0
      await db.setBudget(num)
      this.setData({ modalShow: false })
      wx.showToast({ title: num > 0 ? '预算已更新' : '已取消预算', icon: 'none' })
      this.load()
      return
    }

    if (type === 'nick') {
      const nick = String(val || '').trim().slice(0, 12)
      if (!nick) {
        wx.showToast({ title: '昵称不能为空', icon: 'none' })
        return
      }
      auth.setProfile({ nick: nick })
      this.setData({ modalShow: false, nick: nick, avatarText: nick.slice(0, 1) })
      wx.showToast({ title: '已保存', icon: 'none' })
    }
  },

  /* ---------- 导出 CSV ---------- */
  async exportCsv() {
    const all = await db.listRecords()
    if (!all.length) {
      wx.showToast({ title: '还没有记录可导出', icon: 'none' })
      return
    }
    const csv = L.toCSV(all)
    wx.setClipboardData({
      data: csv,
      success: function () {
        wx.showModal({
          title: '已复制 ' + all.length + ' 条记录',
          content: 'CSV 内容已复制到剪贴板，可粘贴到微信文件传输助手、备忘录或 Excel 中打开。',
          showCancel: false,
          confirmText: '知道了'
        })
      },
      fail: function () {
        wx.showToast({ title: '复制失败', icon: 'none' })
      }
    })
  },

  /* ---------- 清空 ---------- */
  clearAll() {
    const that = this
    wx.showModal({
      title: '清空所有记录？',
      content: '将删除全部 ' + this.data.recordCount + ' 条记录及凭证图片，不可恢复。预算设置会保留。',
      confirmText: '清空',
      confirmColor: '#ef4444',
      success: function (res) {
        if (!res.confirm) return
        db.clearRecords().then(function () {
          wx.showToast({ title: '已清空', icon: 'none' })
          that.load()
        })
      }
    })
  },

  noop() {}
})
