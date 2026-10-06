//note that this is included into <root>/index.html; `vite dev` will use it to find all demo files
import { createApp } from 'vue';
import App from './App.vue';

const app = createApp(App);
// Scene tags are configured in vite.config.mts at build time.
app.mount('#app');
