import DefaultTheme from 'vitepress/theme'
// Documentation intentionally consumes the built package artifact. The docs
// scripts rebuild dist before VitePress starts, matching package consumers.
import {Vuetrex} from "../../../dist/vuetrex.es.js";
import '../styles/styles.css'

export default {
    ...DefaultTheme,
    enhanceApp({ app }) {
        app.component('Vuetrex', Vuetrex)
    }
}
