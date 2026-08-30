import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { build } from 'vite'

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const integrationTempRoot = join(repositoryRoot, 'temp')
await mkdir(integrationTempRoot, { recursive: true })
const projectRoot = await mkdtemp(join(integrationTempRoot, 'vuetrex-esm-consumer-'))

try {
    await mkdir(join(projectRoot, 'src'), { recursive: true })
    await mkdir(join(projectRoot, 'node_modules', '@exceeder'), { recursive: true })

    await symlink(repositoryRoot, join(projectRoot, 'node_modules', '@exceeder', 'vuetrex'), 'dir')
    for (const dependency of ['vue', 'three']) {
        await symlink(
            join(repositoryRoot, 'node_modules', dependency),
            join(projectRoot, 'node_modules', dependency),
            'dir',
        )
    }

    await cp(
        join(repositoryRoot, 'test', 'esm-module', 'TestApp.vue'),
        join(projectRoot, 'src', 'App.vue'),
    )
    await writeFile(join(projectRoot, 'package.json'), JSON.stringify({
        name: 'vuetrex-esm-consumer',
        private: true,
        type: 'module',
    }, null, 2))
    await writeFile(join(projectRoot, 'index.html'), '<div id="app"></div><script type="module" src="/src/main.js"></script>')
    await writeFile(join(projectRoot, 'src', 'main.js'), [
        "import { createApp } from 'vue'",
        "import App from './App.vue'",
        "createApp(App).mount('#app')",
        '',
    ].join('\n'))

    await build({
        root: projectRoot,
        configFile: false,
        logLevel: 'info',
        plugins: [
            vue({
                template: {
                    compilerOptions: {
                        isCustomElement: tag => /^vx-(group|layer|row|stack|ring|panel|instances|box|cylinder|wedge|connector)$/.test(tag),
                    },
                },
            }),
        ],
        build: {
            outDir: 'dist',
            emptyOutDir: true,
        },
    })
} finally {
    await rm(projectRoot, { recursive: true, force: true })
}
