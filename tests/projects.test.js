// 项目建立规则：一个客户/供应商只建一个项目，项目名不带月份，按月提交结算单
import test from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../server/config.js'
config.db.enabled = false // 不触碰真实 MySQL
import { projects } from '../server/repositories/data.js'
import { createProject, updateProject, importProjects } from '../server/services/projects.js'

const pm = { id: 1, roleType: 1, roleTypes: [1], userName: '管理员' }

test('项目建立：一个客户一个项目，名称任何位置都不能带月份/期次', () => {
  projects.splice(0, projects.length)
  const p = createProject(pm, { name: '东嘉' })
  assert.equal(p.name, '东嘉')
  // 各种月份/期次写法（后缀、中间、纯中文月份）都拒绝
  for (const name of ['东嘉-2026-09标注数据', '东嘉-2026-08', '东嘉8月', '东嘉 2026年8月', '东嘉8月份', '东嘉第3期', '东嘉Q2']) {
    assert.throws(() => createProject(pm, { name }), e => e.code === 'PROJECT_NAME_INVALID', `应拒绝：${name}`)
  }
  // 同名 / 同「项目名键」重复建项目被拒（引导到原项目下按月提结算单）
  assert.throws(() => createProject(pm, { name: '东嘉' }), e => e.code === 'PROJECT_DUPLICATE')
  assert.throws(() => createProject(pm, { name: '东嘉科技有限公司' }), e => e.code === 'PROJECT_DUPLICATE')
  assert.equal(projects.length, 1)
})

test('项目建立：改名与批量导入同样受单项目规则约束', () => {
  projects.splice(0, projects.length)
  const a = createProject(pm, { name: '烁雨' })
  createProject(pm, { name: '贵州元壤智能科技有限公司' })

  // 全称/简称/带月份写法都归到同一个项目键
  assert.throws(() => createProject(pm, { name: '贵州元壤智能' }), e => e.code === 'PROJECT_DUPLICATE')
  assert.throws(() => createProject(pm, { name: '贵州元壤智能8月' }), e => e.code === 'PROJECT_NAME_INVALID')

  assert.throws(() => updateProject(pm, a.id, { name: '烁雨-2026-10' }), e => e.code === 'PROJECT_NAME_INVALID')
  assert.throws(() => updateProject(pm, a.id, { name: '贵州元壤智能科技有限公司' }), e => e.code === 'PROJECT_DUPLICATE')
  const renamed = updateProject(pm, a.id, { name: '烁雨（GND）' })
  assert.equal(renamed.name, '烁雨（GND）')

  assert.throws(() => importProjects(pm, { rows: [{ name: '烁雨-2026-11' }] }), e => e.code === 'PROJECT_NAME_INVALID')
  assert.throws(() => importProjects(pm, { rows: [{ name: '贵州元壤智能科技有限公司' }] }), e => e.code === 'PROJECT_DUPLICATE')
  const ok = importProjects(pm, { rows: [{ name: '元壤贵州' }] })
  assert.equal(ok.imported, 1)
})
