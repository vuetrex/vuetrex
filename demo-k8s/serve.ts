import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)
app.config.compilerOptions.isCustomElement = (tag: string) =>
  /^vx-(group|layer|row|stack|ring|panel|instances|box|cylinder|wedge|connectors|edge|port)$/.test(tag)
app.mount('#app')
