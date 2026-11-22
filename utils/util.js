/**
 * 通用工具：金额格式化、日期、颜色
 * 注意：小程序不同机型 JS 引擎对 Intl 支持不一致，这里手写千分位，不依赖 toLocaleString
 */

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 金额数字 → '1,234.56'（不含符号） */
function money(n) {
  const num = Number(n)
  const v = isNaN(num) ? 0 : Math.abs(num)
  const s = v.toFixed(2)
  const dot = s.indexOf('.')
  const int = s.slice(0, dot)
  const dec = s.slice(dot + 1)
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec
}

/** '¥1,234.56' */
function fmt(n) {
  return '¥' + money(n)
}

/** 带正负号的金额：支出用减号，收入用加号 */
function signed(n, type) {
  return (type === 'in' ? '+' : '−') + '¥' + money(n)
}

function todayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function currentMonth() {
  return todayStr().slice(0, 7)
}

/** 'YYYY-MM' → '2026年11月' */
function monthLabel(ym) {
  if (!ym) return ''
  const parts = ym.split('-')
  return parts[0] + '年' + Number(parts[1]) + '月'
}

/** 月份加减，delta 可为负 */
function shiftMonth(ym, delta) {
  const parts = ym.split('-')
  let y = Number(parts[0])
  let m = Number(parts[1]) + delta
  while (m > 12) { m -= 12; y += 1 }
  while (m < 1) { m += 12; y -= 1 }
  return y + '-' + pad(m)
}

/** 'YYYY-MM-DD' → '11月21日 周五' */
function dateLabel(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return Number(parts[1]) + '月' + Number(parts[2]) + '日 ' + week
}

/** 今天 / 昨天 / 11月21日 */
function dayTitle(dateStr) {
  const t = todayStr()
  if (dateStr === t) return '今天'
  const parts = t.split('-')
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  d.setDate(d.getDate() - 1)
  const y = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  if (dateStr === y) return '昨天'
  return dateLabel(dateStr)
}

/** '#f59e0b' + 透明度 → 'rgba(245,158,11,0.13)' 用于分类底色 */
function softColor(hex, alpha) {
  const h = (hex || '#64748b').replace('#', '')
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const a = alpha === undefined ? 0.13 : alpha
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'
}

/** 数字输入清洗：只留数字和一个小数点，最多两位小数 */
function sanitizeAmount(v) {
  let s = String(v || '').replace(/[^\d.]/g, '')
  const firstDot = s.indexOf('.')
  if (firstDot >= 0) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '')
  }
  if (s.indexOf('.') >= 0) {
    const p = s.split('.')
    s = p[0] + '.' + p[1].slice(0, 2)
  }
  if (s.length > 1 && s[0] === '0' && s[1] !== '.') {
    s = s.replace(/^0+/, '')
  }
  if (!s) s = ''
  return s
}

module.exports = {
  pad,
  uid,
  money,
  fmt,
  signed,
  todayStr,
  currentMonth,
  monthLabel,
  shiftMonth,
  dateLabel,
  dayTitle,
  softColor,
  sanitizeAmount
}
