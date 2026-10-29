import { notifications, users, auditLogs } from '../repositories/data.js'
import { ApiError } from '../lib/http.js'
import { nowText } from '../lib/time.js'
import { hasAnyRole, hasRole } from '../lib/roles.js'
import { enqueueFeishu } from './feishu.js'

// 通知的已读状态按账号记录（readBy 存已读用户 id），不再用单一 read 布尔值：
// 早期数据只有 read=true 表示"已读"，这里继续兼容（read=true 视为所有人已读）。
// 管理员在消息中心可以看到全部通知（管理员口径：看全量数据），因此更不能让
// 一个账号标记已读就把别人的未读也清掉。
function readByOf(note) {
  return Array.isArray(note.readBy) ? note.readBy.map(Number) : []
}

function isReadBy(note, userId) {
  if (note.read) return true
  return readByOf(note).includes(Number(userId))
}

function markReadBy(note, userId) {
  const id = Number(userId)
  if (!Array.isArray(note.readBy)) note.readBy = []
  if (!readByOf(note).includes(id)) note.readBy.push(id)
}

// 该通知对该账号是否可见：广播（userIds 为空）所有人可见；管理员看全部
function visibleTo(note, user) {
  if (hasRole(user, 1)) return true
  return note.userIds.length === 0 || note.userIds.map(Number).includes(Number(user.id))
}

// 单元测试 / 本地演练不要真的往飞书群发消息：
// `node --test` 会在测试子进程里设置 NODE_TEST_CONTEXT；NODE_ENV=test 也一并视为测试。
const isTestRun = () => process.env.NODE_ENV === 'test' || !!process.env.NODE_TEST_CONTEXT

// 创建通知：推送给指定的用户或角色范围
export function createNotification(targetUserIds, type, title, content, refType, refId) {
  const ids = Array.isArray(targetUserIds) ? targetUserIds : (targetUserIds ? [targetUserIds] : [])
  const note = {
    id: Math.max(...notifications.map(n => n.id), 0) + 1,
    userIds: ids,
    type, title, content,
    refType: refType || '', refId: refId || 0,
    read: false,
    readBy: [],
    createdAt: nowText()
  }
  notifications.push(note)
  // 自动推送飞书（入串行队列，限速+重试，不阻塞主流程）；落投递审计便于在「系统日志」核对
  if (isTestRun()) return note
  enqueueFeishu(title, content)
    .then(res => {
      auditLogs.push({
        action: 'feishu.push', actorId: null, ok: !!res.sent,
        title, reason: res.sent ? '' : (res.reason || (res.results || []).map(r => r.resp).join('; ')).slice(0, 200),
        at: nowText()
      })
    })
    .catch(err => {
      auditLogs.push({ action: 'feishu.push', actorId: null, ok: false, title, reason: String(err.message || err).slice(0, 200), at: nowText() })
    })
  return note
}

// 把某单据给指定用户的未读提醒标记为已读（改派时清掉原处理人手里的待办）
export function markRefReadForUsers(refType, refId, userIds) {
  const ids = (userIds || []).map(Number).filter(Boolean)
  if (!ids.length) return 0
  let n = 0
  for (const note of notifications) {
    if (note.read) continue
    if (note.refType !== refType) continue
    if (Number(note.refId) !== Number(refId)) continue
    const targets = note.userIds.map(Number).filter(id => ids.includes(id))
    if (!targets.length) continue
    targets.forEach(id => markReadBy(note, id))
    n++
  }
  return n
}

// 获取用户通知（管理员可见全部；已读状态按账号）
export function getNotifications(user, query) {
  const list0 = notifications.filter(n => visibleTo(n, user))
  let list = list0
  const filterType = String(query.get('type') || '').trim()
  if (filterType && filterType !== 'all') {
    list = list.filter(n => n.type === filterType)
  }
  if (query.get('unread') === '1') list = list.filter(n => !isReadBy(n, user.id))

  const unread = list0.filter(n => !isReadBy(n, user.id)).length
  list = list.slice().sort((a, b) => b.id - a.id)
  const page = Math.max(Number(query.get('page') || 1), 1)
  const pageSize = Math.min(Math.max(Number(query.get('pageSize') || 15), 1), 100)
  const start = (page - 1) * pageSize
  const namesOf = (ids) => ids
    .map(id => users.find(u => Number(u.id) === Number(id))?.userName)
    .filter(Boolean)
  const items = list.slice(start, start + pageSize).map(n => ({
    ...n,
    read: isReadBy(n, user.id),
    // 管理员会看到别人的通知：附带"这条是发给谁的"，避免误当成自己的待办
    mine: n.userIds.length === 0 || n.userIds.map(Number).includes(Number(user.id)),
    toNames: n.userIds.length ? namesOf(n.userIds) : []
  }))
  return { items, total: list.length, unread }
}

// 标记单条已读
export function markRead(user, id) {
  const note = notifications.find(n => n.id === id && visibleTo(n, user))
  if (!note) throw new ApiError(404, 'NOT_FOUND', '通知不存在')
  markReadBy(note, user.id)
  return { ...note, read: true }
}

// 全部已读（只清自己的，不影响同一通知的其他接收人）
export function markAllRead(user) {
  let count = 0
  notifications.forEach(n => {
    if (!visibleTo(n, user) || isReadBy(n, user.id)) return
    markReadBy(n, user.id)
    count++
  })
  return { read: count }
}

// 批量创建通知：仅按角色找目标用户（不受 supplierId 限制，用于跨角色的流程节点提醒）
// 账号可持多角色，命中任一角色即推送
export function notifyRoles(roles, type, title, content, refType, refId) {
  const ids = users.filter(u => !u.disabled && hasAnyRole(u, roles)).map(u => u.id)
  return createNotification(ids, type, title, content, refType, refId)
}

// 批量创建通知：按角色+供应商ID找目标用户
export function notifyByRole(supplierName, roles, type, title, content, refType, refId) {
  const wanted = String(supplierName || '').trim()
  const targets = users.filter(u => {
    if (!hasAnyRole(u, roles)) return false
    if (wanted && String(u.userName || '').trim() !== wanted) return false
    return true
  })
  const ids = targets.map(u => u.id)
  return createNotification(ids, type, title, content, refType, refId)
}
