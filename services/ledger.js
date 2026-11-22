/**
 * 业务计算层（纯函数，不碰 wx API，方便单测）
 * 负责把"原始记录"算成页面能直接渲染的视图数据
 */

const { catInfo, catsOf } = require('../utils/constants')
const util = require('../utils/util')

/** 取某月记录 */
function inMonth(list, ym) {
  return (list || []).filter(function (r) {
    return String(r.date || '').slice(0, 7) === ym
  })
}

/** 收支汇总 */
function summarize(list) {
  let income = 0
  let expense = 0
  ;(list || []).forEach(function (r) {
    const v = Number(r.amount) || 0
    if (r.type === 'in') income += v
    else expense += v
  })
  return {
    income: income,
    expense: expense,
    balance: income - expense
  }
}

/** 给记录补上展示字段，WXML 里就不用做运算了 */
function decorate(r) {
  const info = catInfo(r.type, r.cat)
  const imgs = r.imgs || []
  const sub = r.note ? r.note : (r.type === 'in' ? '收入' : '支出')
  return {
    id: r.id,
    type: r.type,
    cat: info.name,
    icon: info.icon,
    color: info.color,
    bg: util.softColor(info.color, 0.13),
    amount: Number(r.amount) || 0,
    amountText: util.signed(r.amount, r.type),
    note: r.note || '',
    date: r.date,
    subText: sub,
    imgCount: imgs.length,
    imgs: imgs,
    created: r.created || 0
  }
}

/** 按日期分组，供明细页渲染 */
function groupByDate(list) {
  const map = {}
  const order = []
  ;(list || []).forEach(function (r) {
    const d = r.date || ''
    if (!map[d]) {
      map[d] = { date: d, label: util.dayTitle(d), items: [], dayIn: 0, dayOut: 0 }
      order.push(d)
    }
    const g = map[d]
    g.items.push(decorate(r))
    const v = Number(r.amount) || 0
    if (r.type === 'in') g.dayIn += v
    else g.dayOut += v
  })

  order.sort(function (a, b) { return a < b ? 1 : -1 })

  return order.map(function (d) {
    const g = map[d]
    const parts = []
    if (g.dayIn > 0) parts.push('收 ' + util.money(g.dayIn))
    if (g.dayOut > 0) parts.push('支 ' + util.money(g.dayOut))
    g.sumText = parts.join('  ·  ')
    return g
  })
}

/** 分类占比（按金额降序） */
function catTotals(list, type) {
  const map = {}
  const order = []
  let total = 0
  ;(list || []).forEach(function (r) {
    if (r.type !== type) return
    const info = catInfo(type, r.cat)
    const v = Number(r.amount) || 0
    total += v
    if (!map[info.name]) {
      map[info.name] = {
        name: info.name,
        icon: info.icon,
        color: info.color,
        bg: util.softColor(info.color, 0.13),
        amount: 0,
        count: 0
      }
      order.push(info.name)
    }
    map[info.name].amount += v
    map[info.name].count += 1
  })

  const items = order.map(function (n) {
    const it = map[n]
    it.amountText = util.fmt(it.amount)
    it.pct = total > 0 ? Math.round((it.amount / total) * 1000) / 10 : 0
    it.pctText = it.pct + '%'
    it.barWidth = total > 0 ? Math.max(2, Math.round((it.amount / total) * 100)) : 0
    return it
  })

  items.sort(function (a, b) { return b.amount - a.amount })
  return items
}

/** 近 N 个月趋势（含当月），返回带柱高百分比的数组 */
function trend(records, months) {
  const n = months || 6
  const now = util.currentMonth()
  const list = []
  for (let i = n - 1; i >= 0; i--) {
    list.push(util.shiftMonth(now, -i))
  }

  const rows = list.map(function (ym) {
    const sum = summarize(inMonth(records, ym))
    return {
      ym: ym,
      label: Number(ym.split('-')[1]) + '月',
      income: sum.income,
      expense: sum.expense,
      incomeText: util.money(sum.income),
      expenseText: util.money(sum.expense)
    }
  })

  let max = 0
  rows.forEach(function (r) {
    if (r.income > max) max = r.income
    if (r.expense > max) max = r.expense
  })

  rows.forEach(function (r) {
    r.inH = max > 0 ? Math.round((r.income / max) * 100) : 0
    r.outH = max > 0 ? Math.round((r.expense / max) * 100) : 0
    if (r.income > 0 && r.inH < 3) r.inH = 3
    if (r.expense > 0 && r.outH < 3) r.outH = 3
  })

  return { rows: rows, max: max }
}

/**
 * 与上月对比
 * 返回 { text, dir }，dir: 'up' | 'down' | 'flat' | 'none'
 * 页面据此决定文案颜色（收入涨是好事，支出涨是坏事，由 callers 决定怎么用）
 */
function compareText(cur, prev) {
  const c = Number(cur) || 0
  const p = Number(prev) || 0
  if (p <= 0) {
    return { text: c > 0 ? '上月无数据' : '', dir: 'none' }
  }
  const diff = ((c - p) / p) * 100
  if (Math.abs(diff) < 1) return { text: '与上月持平', dir: 'flat' }
  const dir = diff > 0 ? 'up' : 'down'
  return {
    text: (diff > 0 ? '↑' : '↓') + Math.abs(Math.round(diff)) + '% 较上月',
    dir: dir
  }
}

/** 预算状态 */
function budgetState(budget, expense) {
  if (!budget || budget <= 0) {
    return { set: false, text: '未设置', pct: 0, barWidth: 0, over: false, leftText: '' }
  }
  const pct = Math.round((expense / budget) * 100)
  const left = budget - expense
  return {
    set: true,
    text: util.fmt(budget),
    pct: pct,
    barWidth: Math.min(100, pct),
    over: left < 0,
    leftText: left >= 0
      ? '剩余 ' + util.fmt(left)
      : '已超支 ' + util.fmt(Math.abs(left))
  }
}

/** CSV 导出内容（带 BOM 便于 Excel 识别中文） */
function toCSV(records) {
  const head = '日期,类型,分类,金额,备注,凭证数'
  const lines = (records || []).map(function (r) {
    const info = catInfo(r.type, r.cat)
    const note = String(r.note || '').replace(/"/g, '""')
    const imgs = (r.imgs || []).length
    return [
      r.date,
      r.type === 'in' ? '收入' : '支出',
      info.name,
      (Number(r.amount) || 0).toFixed(2),
      '"' + note + '"',
      imgs
    ].join(',')
  })
  return '\ufeff' + [head].concat(lines).join('\n')
}

module.exports = {
  inMonth,
  summarize,
  decorate,
  groupByDate,
  catTotals,
  trend,
  compareText,
  budgetState,
  toCSV,
  catsOf
}
