import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { cp, mkdir, mkdtemp, rm, symlink, writeFile, readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
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
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    const metadata = JSON.parse(await readFile(join(packageRoot, manifest['web-types']), 'utf8'))
    const root = metadata.contributions.html.elements[0]
    for (const item of [root, ...root.attributes]) {
        const contract = await readFile(join(packageRoot, item.source.file), 'utf8')
        assert.ok(contract.slice(item.source.offset).startsWith(item === root ? 'VuetrexProps' : item.name))
    }
    for (const element of metadata.contributions.html.elements.slice(1)) {
        for (const attr of element.attributes) {
            const contract = await readFile(join(packageRoot, attr.source.file), 'utf8')
            const camelCase = attr.name.replace(/-([a-z])/g, (_, character) => character.toUpperCase())
            assert.ok(contract.slice(attr.source.offset).startsWith(camelCase))
        }
    }
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
    await cp(join(repositoryRoot, 'test', 'esm-module', 'CustomBrick.ts'), join(projectRoot, 'src', 'CustomBrick.ts'))
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
        "import { Vuetrex, VxStylesheet, VxStyleSheet, defineVxStyleSheet, finishes, useCanvasTexture, type VuetrexProps, type VuetrexEvents, type VxSettings, type VxMaterialBinding, type VxEnvironmentProps, type VxCameraProps, type VxFloorProps, type ConnectorHandle, type ConnectorPortDeclarationRecord, type ConnectorHostProps } from '@exceeder/vuetrex'",
        "const settings = { fog: { near: 20 }, diagnostics: { footprints: true }, floorFadeStart: 20 } satisfies VxSettings",
        "const root: VuetrexProps = { settings, height: '520px', stopped: false, scheme: 'system' }",
        "type Props = InstanceType<typeof Vuetrex>['$props']",
        "const liveRoot: Props = { ...root, camera: { orbit: { target: [0, 0, 0], height: 9, radius: 24, azimuth: -30 } }, onReady: stage => { stage.camera.timeline({ repeat: -1, yoyo: true }).to({ azimuth: 30 }, { duration: 60, ease: 'none' }) } }",
        "type Assert<T extends true> = T",
        "type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false",
        "type ReadyIsTyped = Assert<Same<Parameters<NonNullable<Props['onReady']>>, VuetrexEvents['ready']>>",
        "// @ts-expect-error stopped is boolean",
        "const invalid: Props = { stopped: 'yes' }",
        "// @ts-expect-error nested settings are typed",
        "const invalidSettings: Props = { settings: { fog: { near: 'twenty' } } }",
        "void [liveRoot, invalid, invalidSettings]",
        "const connector: ConnectorHostProps = { scope: 'network', appearance: 'primary', strokeWidth: 0.02 }",
        "const handle: ConnectorHandle = { scope: 'network', key: 'a-b' }",
        "const port: ConnectorPortDeclarationRecord = { name: 'output', face: 'right' }",
        "void [connector, handle, port]",
        "const sheet = defineVxStyleSheet({ common: { materials: { metal: { base: finishes.satinMetal() } }, connectors: { primary: { strokeColor: '#abcdef' } } } })",
        "const binding: VxMaterialBinding = { preset: 'metal', roughness: 0.2, bumpMap: null, bumpScale: 0.012 }",
        "const environment: VxEnvironmentProps = { preset: 'studio', rotation: 0.5 }",
        "const camera: VxCameraProps = { direction: [8, 6, 11], fit: 'content' }",
        "const floor: VxFloorProps = { finish: 'mirror', reflection: 0.6, fadeStart: 20, fadeEnd: 50 }",
        "const heightTexture = () => useCanvasTexture(() => {}, { purpose: 'bump' })",
        "void [heightTexture, sheet, binding, environment, camera, floor, VxStylesheet, VxStyleSheet, useCanvasTexture]",
    ].join('\n'))
    await writeFile(join(projectRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
        target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true,
        skipLibCheck: false, types: [], lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    }, include: ['consumer.ts', 'src/CustomBrick.ts'] }))
    execFileSync(process.execPath, [join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(projectRoot, 'tsconfig.json')], { stdio: 'inherit' })

    // Exercise actual template inference as well as TypeScript object assignments.
    const template = (attributes) => `<script setup lang="ts">\nimport { Vuetrex, VxStylesheet, defineVxStyleSheet } from '@exceeder/vuetrex'\nconst sheet = defineVxStyleSheet({ common: { materials: { accent: { base: { color: 'red' } } } } })\n</script>\n<template><vx-stylesheet :sheets="[sheet]"><Vuetrex ${attributes} /></vx-stylesheet></template>`
    await writeFile(join(projectRoot, 'Root.vue'), template(':camera="{ orbit: { target: [0, 0, 0], height: 9, radius: 24, azimuth: -30 } }" :settings="{ fog: { near: 20 } }" :sheets="[sheet]" scheme="system" :stopped="false" @ready="stage => stage.camera.timeline({ yoyo: true }).to({ azimuth: 30 }, { duration: 60 })"'))
    await writeFile(join(projectRoot, 'vue-tsconfig.json'), JSON.stringify({
        extends: './tsconfig.json', include: ['Root.vue'], vueCompilerOptions: { strictTemplates: true },
    }))
    const vueCheck = () => execFileSync(process.execPath, [
        join(repositoryRoot, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js'),
        '-p', join(projectRoot, 'vue-tsconfig.json'),
    ], { encoding: 'utf8', stdio: 'pipe' })
    vueCheck()
    await writeFile(join(projectRoot, 'Root.vue'), template(':stopped="123" :settings="{ fog: { near: \'bad\' } }" @ready="stage => stage.nonexistentMethod()"'))
    assert.throws(vueCheck, error => {
        assert.match(error.stdout, /not assignable to type 'boolean/)
        assert.match(error.stdout, /not assignable to type 'number/)
        assert.match(error.stdout, /nonexistentMethod/)
        return true
    })

    await build({
        root: projectRoot,
        configFile: false,
        logLevel: 'info',
        plugins: [
            vue({
                template: {
                    compilerOptions: {
                        isCustomElement: tag => /^vx-(group|layer|row|stack|ring|panel|instances|geometry|particles|box|cylinder|wedge|connectors|edge|port|environment|camera|floor|custom-brick)$/.test(tag),
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
