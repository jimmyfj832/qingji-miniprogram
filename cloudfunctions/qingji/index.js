/**
 * 苗苗记账 · 云函数（action 路由）
 * ------------------------------------------------------------------
 * 前端通过 wx.cloud.callFunction({ name:'qingji', data:{ action, ... } }) 调用。
 * 统一返回 { ok:true, data } 或 { ok:false, msg }。
 *
 * 安全要点：
 *   1. 身份只认 cloud.getWXContext().OPENID，不信任前端传入的任何 uid
 *   2. 云函数以管理员权限运行，_openid 不会自动写入/过滤，必须显式处理
 *      写入：data 里手动带上 _openid
 *      读写：where 条件里强制加 _openid
 *   3. 任何按 id 的操作都同时校验 _openid，防止越权
 * ------------------------------------------------------------------
 */

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const RECORDS = 'records'
const CONFIGS = 'configs'

/* ================================================================
   工具
   ================================================================ */

function ok(data) {
  return { ok: true, data: data === undefined ? null : data }
}

function fail(msg) {
  return { ok: false, msg: msg || '操作失败' }
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function todayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/** 云文档 → 前端契约（_id 映射为 id，_openid 不外泄） */
function toRecord(doc) {
  if (!doc) return null
  return {
    id: doc._id,
    type: doc.type === 'in' ? 'in' : 'out',
    cat: doc.cat || '其他',
    amount: Number(doc.amount) || 0,
    note: doc.note || '',
    date: doc.date || '',
    imgs: Array.isArray(doc.imgs) ? doc.imgs : [],
    created: Number(doc.created) || 0
  }
}

function isCloudFile(p) {
  return typeof p === 'string' && p.indexOf('cloud://') === 0
}

/** 分批删除云存储文件（单次上限 50） */
async function deleteFiles(paths) {
  const list = (paths || []).filter(isCloudFile)
  for (let i = 0; i < list.length; i += 50) {
    try {
      await cloud.deleteFile({ fileList: list.slice(i, i + 50) })
    } catch (e) {
      // 文件可能已被删除，不影响主流程
    }
  }
}

/* ================================================================
   业务
   ================================================================ */

/** 取该用户全部账单（云数据库单次上限 100，循环取全） */
async function listRecords(openid) {
  const PAGE = 100
  const MAX_ROWS = 5000
  const rows = []
  let skip = 0

  while (skip < MAX_ROWS) {
    const res = await db
      .collection(RECORDS)
      .where({ _openid: openid })
      .orderBy('_id', 'asc')
      .skip(skip)
      .limit(PAGE)
      .get()

    const batch = res.data || []
    rows.push.apply(rows, batch)
    if (batch.length < PAGE) break
    skip += PAGE
  }

  return rows.map(toRecord)
}

async function getRecord(openid, id) {
  if (!id) return null
  const res = await db
    .collection(RECORDS)
    .where({ _id: id, _openid: openid })
    .limit(1)
    .get()
  return toRecord((res.data || [])[0])
}

async function addRecord(openid, r) {
  const doc = {
    _openid: openid, // 云函数写入必须显式带，否则记录无归属
    type: r.type === 'in' ? 'in' : 'out',
    cat: r.cat || '其他',
    amount: Number(r.amount) || 0,
    note: r.note || '',
    date: r.date || todayStr(),
    imgs: Array.isArray(r.imgs) ? r.imgs : [],
    created: Number(r.created) || Date.now()
  }

  const res = await db.collection(RECORDS).add({ data: doc })
  return toRecord(Object.assign({ _id: res._id }, doc))
}

async function updateRecord(openid, r) {
  if (!r.id) throw new Error('缺少记录 ID')

  const patch = {}
  if (r.type === 'in' || r.type === 'out') patch.type = r.type
  if (typeof r.cat === 'string' && r.cat) patch.cat = r.cat
  if (r.amount !== undefined) patch.amount = Number(r.amount) || 0
  if (typeof r.note === 'string') patch.note = r.note
  if (typeof r.date === 'string' && r.date) patch.date = r.date
  if (Array.isArray(r.imgs)) patch.imgs = r.imgs

  if (!Object.keys(patch).length) throw new Error('没有需要更新的字段')

  const res = await db
    .collection(RECORDS)
    .where({ _id: r.id, _openid: openid })
    .update({ data: patch })

  const updated = (res.stats && res.stats.updated) || 0
  if (!updated) throw new Error('记录不存在或无权修改')

  return getRecord(openid, r.id)
}

async function removeRecord(openid, id) {
  if (!id) throw new Error('缺少记录 ID')

  const rec = await getRecord(openid, id)
  if (!rec) throw new Error('记录不存在或无权删除')

  const res = await db
    .collection(RECORDS)
    .where({ _id: id, _openid: openid })
    .remove()

  if (!((res.stats && res.stats.removed) || 0)) {
    throw new Error('删除失败，可能已被移除')
  }

  await deleteFiles(rec.imgs)
}

async function getBudget(openid) {
  const res = await db
    .collection(CONFIGS)
    .where({ _openid: openid, key: 'budget' })
    .limit(1)
    .get()

  const doc = (res.data || [])[0]
  return doc ? Number(doc.value) || 0 : 0
}

async function setBudget(openid, budget) {
  const value = Number(budget) || 0

  const res = await db
    .collection(CONFIGS)
    .where({ _openid: openid, key: 'budget' })
    .limit(1)
    .get()

  const doc = (res.data || [])[0]

  if (doc) {
    await db.collection(CONFIGS).doc(doc._id).update({
      data: { value: value, updated: Date.now() }
    })
  } else {
    await db.collection(CONFIGS).add({
      data: {
        _openid: openid,
        key: 'budget',
        value: value,
        updated: Date.now()
      }
    })
  }

  return value
}

async function clearRecords(openid) {
  // 先收集图片，删除记录后就拿不到了
  const all = await listRecords(openid)
  const imgs = []
  all.forEach(function (r) {
    (r.imgs || []).forEach(function (p) {
      if (isCloudFile(p)) imgs.push(p)
    })
  })

  // 服务端 where().remove() 单次上限 100 条，循环清空
  let guard = 0
  while (guard < 100) {
    const res = await db.collection(RECORDS).where({ _openid: openid }).remove()
    const removed = (res.stats && res.stats.removed) || 0
    if (!removed) break
    guard++
  }

  await deleteFiles(imgs)
}

/* ================================================================
   入口
   ================================================================ */

exports.main = async function (event, context) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) return fail('无法获取用户身份')

  const action = event && event.action

  try {
    switch (action) {
      case 'list':
        return ok(await listRecords(openid))
      case 'get':
        return ok(await getRecord(openid, event.id))
      case 'add':
        return ok(await addRecord(openid, event))
      case 'update':
        return ok(await updateRecord(openid, event))
      case 'remove':
        return ok(await removeRecord(openid, event.id))
      case 'getBudget':
        return ok(await getBudget(openid))
      case 'setBudget':
        return ok(await setBudget(openid, event.budget))
      case 'clear':
        return ok(await clearRecords(openid))
      default:
        return fail('未知操作: ' + action)
    }
  } catch (e) {
    console.error('[qingji] action=' + action + ' 失败:', e)
    return fail(e.message || '服务异常')
  }
}
