import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)
app.config.compilerOptions.isCustomElement = (tag: string) =>
  /^vx-(group|layer|row|stack|ring|panel|box|cylinder|wedge|connector)$/.test(tag)
app.mount('#app')
