import { readdir, readFile, writeFile, stat, mkdir, copyFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

const root = resolve('dist_types')
// TypeScript consumes authored declarations but does not copy them to outDir.
for (const name of await readdir(resolve('src'), { recursive: true })) {
    if (!name.endsWith('.d.ts')) continue
    const destination = resolve(root, 'src', name)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(resolve('src', name), destination)
}
for (const name of await readdir(root, { recursive: true })) {
    if (!name.endsWith('.d.ts')) continue
    const file = resolve(root, name)
    const source = await readFile(file, 'utf8')
    const imports = [...source.matchAll(/(['"])@\/([^'"]+)\1/g)]
    let next = source
    for (const match of imports) {
        let target = resolve(root, 'src', match[2])
        if (await stat(target).then(value => value.isDirectory(), () => false)) target = resolve(target, 'index.js')
        let specifier = relative(dirname(file), target).split('\\').join('/')
        if (!specifier.startsWith('.')) specifier = './' + specifier
        next = next.replaceAll(match[0], match[1] + specifier + match[1])
    }
    if (next !== source) await writeFile(file, next)
}
