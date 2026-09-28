import { createApp } from 'vue';
import App from './App.vue';

const app = createApp(App);
// Custom tags are recognized at build time by the shared Vite configuration.
app.mount('#app');
