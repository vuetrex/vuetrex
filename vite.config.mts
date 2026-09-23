import * as path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'
import vue from '@vitejs/plugin-vue'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolveFromConfig = createRequire(import.meta.url)
const troikaTextPackageDir = path.dirname(
    resolveFromConfig.resolve('troika-three-text/package.json')
)
const resolveFromTroika = createRequire(path.join(troikaTextPackageDir, 'package.json'))
const troikaThreeUtilsPackageDir = path.dirname(
    resolveFromTroika.resolve('troika-three-utils/package.json')
)
const troikaWorkerUtilsPackageDir = path.dirname(
    resolveFromTroika.resolve('troika-worker-utils/package.json')
)

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
                    /^vx-(group|layer|row|stack|ring|panel|instances|geometry|particles|display-wall|spacer|box|cylinder|wedge|connectors|edge|port|environment|camera|floor)$/.test(tag)
            }
        }}),
        glsl()
    ],
    // @ts-ignore
    test: {
        globals: true,
        environment: "happy-dom",
        setupFiles: ['./test/setup.ts'],
        alias: {
            // Vitest resolves external package entry points with Node semantics,
            // which ignores Troika's legacy `module` field and selects its UMD
            // `main`. Point the test graph at the published ESM entry explicitly.
            'troika-three-text': path.join(
                troikaTextPackageDir,
                'dist/troika-three-text.esm.js'
            ),
            'troika-three-utils': path.join(
                troikaThreeUtilsPackageDir,
                'dist/troika-three-utils.esm.js'
            ),
            'troika-worker-utils': path.join(
                troikaWorkerUtilsPackageDir,
                'dist/troika-worker-utils.esm.js'
            )
        },
        server: {
            deps: {
                // Keep Troika's package family inside Vite's module graph so its
                // ESM imports are transformed instead of handed back to Node.
                inline: [/troika-(?:three-text|three-utils|worker-utils)/]
            }
        }
    }
})
