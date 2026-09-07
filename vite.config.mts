import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'
import vue from '@vitejs/plugin-vue'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
    root: __dirname,
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            '/docs': {
                target: 'http://127.0.0.1:5174',
                ws: true,
            }
        }
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src/')
        }
    },
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/lib-components/index.ts'),
            name: 'Vuetrex',
            formats: ['es'],
            fileName: (format: string) => `vuetrex.${format}.js`,
        },
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, "src/lib-components/index.ts")
            },
            output: {
                // Provide global variables to use in the UMD build
                // for externalized deps
                globals: {
                    vue: 'Vue',
                    three: 'THREE'
                }
            },
            external: ['vue', 'three'],
            // https://rollupjs.org/guide/en/#big-list-of-options
        },
        target: "esnext",
        sourcemap: true
    },
    plugins: [
        vue({
        template: {
            compilerOptions: {
                isCustomElement: (tag:string) =>
                    /^vx-(group|layer|row|stack|ring|panel|instances|geometry|display-wall|spacer|box|cylinder|wedge|connector|bus-connector)$/.test(tag)
                    || tag === 'bus-connector'
            }
        }}),
        glsl()
    ],
    // @ts-ignore
    test: {
        globals: true,
        environment: "happy-dom",
        setupFiles: ['./test/setup.ts']
    }
})
