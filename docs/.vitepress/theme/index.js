import DefaultTheme from 'vitepress/theme'
// Documentation intentionally consumes the built package artifact. The docs
// scripts rebuild dist before VitePress starts, matching package consumers.
// Vuetrex is available from most recent build
import {Vuetrex} from "../../../dist/vuetrex.es.js";
import ExampleTabs from './ExampleTabs.vue'
import '../styles/styles.css'

export default {
    ...DefaultTheme,
    enhanceApp({ app }) {
        app.component('Vuetrex', Vuetrex)
        app.component('ExampleTabs', ExampleTabs)
    }
}
