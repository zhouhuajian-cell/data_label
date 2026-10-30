<template>
  <el-dialog v-model="createVisible" title="新建项目" width="560px" :close-on-click-modal="false" @closed="resetCreate">
    <el-form ref="formRef" :model="createForm" :rules="rules" label-width="90px" style="margin-top:6px">
      <el-form-item label="项目名称" prop="name">
        <el-input v-model="createForm.name" placeholder="按客户/供应商建一个项目，如：东嘉（不要带月份）" />
        <div class="form-hint">一个项目只建一次；之后每个月在同一项目下提交一张结算单，结算周期在单据里填真实月份（如 2026-08）。</div>
      </el-form-item>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="业务类型" prop="bizType">
            <el-select v-model="createForm.bizType" placeholder="默认标注" filterable allow-create default-first-option style="width:100%">
              <el-option label="标注" value="标注" />
              <el-option label="数据闭环" value="数据闭环" />
              <el-option label="vslam" value="vslam" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="数据类型" prop="annotateType">
            <el-select v-model="createForm.annotateType" placeholder="可不填，也可自定义" filterable allow-create clearable default-first-option style="width:100%">
              <el-option v-for="t in annotateTypes" :key="t" :label="t" :value="t" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="截止时间">
        <el-date-picker v-model="createForm.deadline" type="date" style="width:100%" value-format="YYYY-MM-DD" />
      </el-form-item>
      <el-form-item label="项目描述">
        <el-input v-model="createForm.description" type="textarea" :rows="3" placeholder="项目描述（选填）" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="createVisible = false">取消</el-button>
      <el-button type="primary" :loading="actionLoading" @click="submitCreate">创建项目</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
// 新建项目：结算以项目为单位，这里只建"项目"本身。
// 原「任务明细」一步（标注类型/样本量/单价 + Excel 导入任务）属数据生产域，已移除。
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { ANNOTATE_TYPES } from '@/utils/constants'
import { createProjectApi } from '@/api/projects'

const emit = defineEmits(['created'])

const annotateTypes = ANNOTATE_TYPES
const actionLoading = ref(false)
const createVisible = ref(false)
const formRef = ref(null)
const createForm = reactive({ name: '', bizType: '标注', annotateType: '', deadline: '', description: '' })
// 项目名不允许带月份/期次（一个月一个项目会导致同一项目被拆散、成本中心/结算无法按月归类）
const MONTH_SUFFIX_RE = /\s*[-_—·]?\s*(?:19|20)\d{2}\s*[-_.年]?\s*(?:0?[1-9]|1[0-2])\s*月?\s*$/
function validateProjectName(rule, value, callback) {
  const v = String(value || '').trim().replace(/\s*(?:标注数据|验收数据|结算数据)\s*$/, '')
  if (MONTH_SUFFIX_RE.test(v)) {
    callback(new Error('项目名不要带月份：请在原项目下按月提交结算单，结算周期填真实月份'))
    return
  }
  callback()
}
const rules = {
  name: [
    { required: true, message: '请输入项目名称', trigger: 'blur' },
    { validator: validateProjectName, trigger: 'blur' }
  ]
  // 数据类型选填；业务类型有默认值「标注」
}

const resetCreate = () => {
  formRef.value?.resetFields()
  Object.assign(createForm, { name: '', bizType: '标注', annotateType: '', deadline: '', description: '' })
}

const open = () => { resetCreate(); createVisible.value = true }
defineExpose({ open })

async function submitCreate() {
  try { await formRef.value.validate() } catch { return }
  actionLoading.value = true
  try {
    await createProjectApi({
      name: createForm.name.trim(),
      annotateType: createForm.annotateType,
      bizType: createForm.bizType,
      deadline: createForm.deadline,
      description: createForm.description
    })
    ElMessage.success('项目创建成功')
    createVisible.value = false
    emit('created')
  } finally { actionLoading.value = false }
}
</script>

<style scoped>
.form-hint { margin-top: 4px; font-size: 12px; line-height: 1.6; color: var(--text-3, #909399); }
</style>
