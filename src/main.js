import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import '@/styles/theme.css'
import { useUserStore } from '@/store/user'
import { getMeApi } from '@/api/auth'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
// 全局中文语言包：日期/月份选择器、分页、空状态等 Element Plus 文案统一显示中文
app.use(ElementPlus, { locale: zhCn })

app.config.errorHandler = (err, instance, info) => {
  console.error('[Global Error]', { message: err.message, info, stack: err.stack })
}

const userStore = useUserStore()

async function bootstrap() {
  if (userStore.token) {
    try {
      const { data } = await getMeApi()
      userStore.setUserInfo(data)
    } catch (error) {
      if (error.status === 401) {
        userStore.logout()
        return
      }
      console.warn('初始化用户信息失败', error)
    }
  }
  app.mount('#app')
}

bootstrap()
