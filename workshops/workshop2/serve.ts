//note that this is included into <root>/index.html; `vite dev` will use it to find all demo files
import { createApp } from 'vue';
import App from './App.vue';

const app = createApp(App);
// Custom elements are configured at compile time in vite.config.mts.
app.mount('#app');
