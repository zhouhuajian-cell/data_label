// 站内消息：管理员看全部、已读按账号隔离（不互相清未读）
import test from 'node:test'
import assert from 'node:assert/strict'
import { notifications, users, feishuConfig } from '../server/repositories/data.js'
import { createNotification, getNotifications, markRead, markAllRead } from '../server/services/notifications.js'
import { feishuQueueSize } from '../server/services/feishu.js'

// 测试进程内关闭飞书推送：绝不向外发请求（createNotification 另外还有测试环境兜底）
feishuConfig.enabled = false

const admin = { id: 1, userName: '管理员', roleType: 1, roleTypes: [1], disabled: false }
const engineer = { id: 2, userName: '工程师', roleType: 13, roleTypes: [13], disabled: false }
const finance = { id: 3, userName: '财务', roleType: 14, roleTypes: [14], disabled: false }

function reset() {
  users.splice(0, users.length, admin, engineer, finance)
  notifications.splice(0, notifications.length)
}

const query = (qs = '') => new URLSearchParams(qs)

test('站内消息：测试环境不把消息推到飞书群', () => {
  reset()
  createNotification([engineer.id], 'todo', '测试消息', '内容', 'bill', 1)
  assert.equal(feishuQueueSize(), 0, '测试进程不应产生飞书推送任务')
})

test('站内消息：管理员可见全部，普通账号只看发给自己的', () => {
  reset()
  createNotification([engineer.id], 'todo', '待工程师确认', '内容', 'bill', 9)
  assert.equal(getNotifications(engineer, query()).total, 1, '被指派人可见')
  assert.equal(getNotifications(finance, query()).total, 0, '无关账号不可见')
  assert.equal(getNotifications(admin, query()).total, 1, '管理员可见全部')
  const item = getNotifications(admin, query()).items[0]
  assert.equal(item.mine, false, '管理员看到的他人消息应标记非本人待办')
  assert.deepEqual(item.toNames, ['工程师'], '附带实际接收人')
})

test('站内消息：已读按账号记录，互不影响；管理员全部已读不误清别人未读', () => {
  reset()
  const note = createNotification([engineer.id, finance.id], 'finance', '待财务确认', '内容', 'bill', 10)
  markRead(engineer, note.id)
  assert.equal(getNotifications(engineer, query()).items[0].read, true, '工程师已读')
  assert.equal(getNotifications(finance, query()).items[0].read, false, '财务仍未读')
  assert.equal(getNotifications(admin, query()).unread, 1, '管理员未读只算自己没读过的')

  markAllRead(admin)
  assert.equal(getNotifications(admin, query()).unread, 0, '管理员全部已读')
  assert.equal(getNotifications(finance, query()).items[0].read, false, '别人未读不受影响')
  assert.equal(getNotifications(finance, query()).unread, 1)

  // 静态数据里不带 readBy 的历史通知：read=true 仍视为已读
  notifications.push({ id: 999, userIds: [], type: 'system', title: '历史', content: '', refType: '', refId: 0, read: true, createdAt: '2026-01-01 00:00:00' })
  assert.equal(getNotifications(finance, query('unread=1')).items.some(n => n.id === 999), false)
})
