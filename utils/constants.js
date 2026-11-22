/**
 * 分类与存储键定义
 * 与 Web 版 qingji 保持完全一致，方便两边数据对照
 */

const EXPENSE_CATS = [
  { name: '餐饮', icon: '🍜', color: '#f59e0b' },
  { name: '交通', icon: '🚌', color: '#06b6d4' },
  { name: '购物', icon: '🛍️', color: '#ec4899' },
  { name: '居住', icon: '🏠', color: '#8b5cf6' },
  { name: '娱乐', icon: '🎮', color: '#10b981' },
  { name: '医疗', icon: '💊', color: '#ef4444' },
  { name: '教育', icon: '📚', color: '#6366f1' },
  { name: '人情', icon: '🎁', color: '#f97316' },
  { name: '其他', icon: '📦', color: '#64748b' }
]

const INCOME_CATS = [
  { name: '工资', icon: '💼', color: '#10b981' },
  { name: '奖金', icon: '🏆', color: '#f59e0b' },
  { name: '理财', icon: '📈', color: '#06b6d4' },
  { name: '兼职', icon: '💻', color: '#8b5cf6' },
  { name: '其他', icon: '💰', color: '#64748b' }
]

/** 本地存储键前缀，均以 uid 结尾做数据隔离 */
const STORAGE = {
  DEVICE: 'qj_device_v1',   // 设备匿名身份
  PROFILE: 'qj_profile_',   // 昵称等
  REC: 'qj_rec_',           // 账单列表
  BUDGET: 'qj_budget_'      // 月度预算
}

const FALLBACK_CAT = { name: '其他', icon: '📦', color: '#64748b' }

function catsOf(type) {
  return type === 'in' ? INCOME_CATS : EXPENSE_CATS
}

function catInfo(type, name) {
  const arr = catsOf(type)
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].name === name) return arr[i]
  }
  return { name: name || FALLBACK_CAT.name, icon: FALLBACK_CAT.icon, color: FALLBACK_CAT.color }
}

module.exports = {
  EXPENSE_CATS,
  INCOME_CATS,
  STORAGE,
  catsOf,
  catInfo
}
