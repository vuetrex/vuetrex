import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { build } from 'vite'

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const integrationTempRoot = tmpdir()
await mkdir(integrationTempRoot, { recursive: true })
const projectRoot = await mkdtemp(join(integrationTempRoot, 'vuetrex-esm-consumer-'))

try {
    await mkdir(join(projectRoot, 'src'), { recursive: true })
    await mkdir(join(projectRoot, 'node_modules', '@exceeder'), { recursive: true })

    const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--cache', join(projectRoot, 'npm-cache'), '--pack-destination', projectRoot], { cwd: repositoryRoot, encoding: 'utf8' }))[0]
    const packageRoot = join(projectRoot, 'node_modules', '@exceeder', 'vuetrex')
    await mkdir(packageRoot, { recursive: true })
    execFileSync('tar', ['-xzf', join(projectRoot, packed.filename), '--strip-components=1', '-C', packageRoot])
    await mkdir(join(projectRoot, 'node_modules', '@types'), { recursive: true })
    for (const dependency of ['vue', 'three', 'gsap', '@types/three']) {
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

    await writeFile(join(projectRoot, 'consumer.ts'), [
        "import { VxStyleSheet, defineVxStyleSheet, finishes, useCanvasTexture, type VxMaterialBinding, type VxEnvironmentProps, type VxCameraProps, type VxFloorProps } from '@exceeder/vuetrex'",
        "const sheet = defineVxStyleSheet({ common: { materials: { metal: { base: finishes.satinMetal() } } } })",
        "const binding: VxMaterialBinding = { preset: 'metal', roughness: 0.2, bumpMap: null, bumpScale: 0.012 }",
        "const environment: VxEnvironmentProps = { preset: 'studio', rotation: 0.5 }",
        "const camera: VxCameraProps = { direction: [8, 6, 11], fit: 'content' }",
        "const floor: VxFloorProps = { finish: 'mirror', reflection: 0.6 }",
        "const heightTexture = () => useCanvasTexture(() => {}, { purpose: 'bump' })",
        "void [heightTexture, sheet, binding, environment, camera, floor, VxStyleSheet, useCanvasTexture]",
    ].join('\n'))
    await writeFile(join(projectRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
        target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true,
        skipLibCheck: false, types: [], lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    }, include: ['consumer.ts'] }))
    execFileSync(process.execPath, [join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(projectRoot, 'tsconfig.json')], { stdio: 'inherit' })

    await build({
        root: projectRoot,
        configFile: false,
        logLevel: 'info',
        plugins: [
            vue({
                template: {
                    compilerOptions: {
                        isCustomElement: tag => /^vx-(group|layer|row|stack|ring|panel|instances|geometry|particles|box|cylinder|wedge|connectors|environment|camera|floor)$/.test(tag),
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
