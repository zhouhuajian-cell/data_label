// 项目建立规则：一个客户/供应商只建一个项目，项目名不带月份，按月提交结算单
import test from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../server/config.js'
config.db.enabled = false // 不触碰真实 MySQL
import { projects } from '../server/repositories/data.js'
import { createProject, updateProject, importProjects } from '../server/services/projects.js'

const pm = { id: 1, roleType: 1, roleTypes: [1], userName: '管理员' }

test('项目建立：一个客户一个项目，名称不能带月份/期次', () => {
  projects.splice(0, projects.length)
  const p = createProject(pm, { name: '东嘉' })
  assert.equal(p.name, '东嘉')
  // 历史式「供应商-年月」命名一律拒绝
  assert.throws(() => createProject(pm, { name: '东嘉-2026-09标注数据' }), e => e.code === 'PROJECT_NAME_INVALID')
  assert.throws(() => createProject(pm, { name: '东嘉-2026-08' }), e => e.code === 'PROJECT_NAME_INVALID')
  // 同名/同基础名重复建项目被拒（引导到原项目下按月提结算单）
  assert.throws(() => createProject(pm, { name: '东嘉' }), e => e.code === 'PROJECT_DUPLICATE')
  assert.equal(projects.length, 1)
})

test('项目建立：改名与批量导入同样受单项目规则约束', () => {
  projects.splice(0, projects.length)
  const a = createProject(pm, { name: '烁雨' })
  createProject(pm, { name: '贵州元壤智能科技有限公司' })

  assert.throws(() => updateProject(pm, a.id, { name: '烁雨-2026-10' }), e => e.code === 'PROJECT_NAME_INVALID')
  assert.throws(() => updateProject(pm, a.id, { name: '贵州元壤智能科技有限公司' }), e => e.code === 'PROJECT_DUPLICATE')
  const renamed = updateProject(pm, a.id, { name: '烁雨（GND）' })
  assert.equal(renamed.name, '烁雨（GND）')

  assert.throws(() => importProjects(pm, { rows: [{ name: '烁雨-2026-11' }] }), e => e.code === 'PROJECT_NAME_INVALID')
  assert.throws(() => importProjects(pm, { rows: [{ name: '贵州元壤智能科技有限公司' }] }), e => e.code === 'PROJECT_DUPLICATE')
  const ok = importProjects(pm, { rows: [{ name: '元壤贵州' }] })
  assert.equal(ok.imported, 1)
})
