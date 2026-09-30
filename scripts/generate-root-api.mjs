import ts from 'typescript'
import { readFile, writeFile } from 'node:fs/promises'

// Root interfaces drive the reference page; connector interfaces also contribute editor tags.
const file = 'src/lib-components/root-api.d.ts'
const navigationFile = 'dist_types/' + file
const input = await readFile(file, 'utf8')
const source = ts.createSourceFile(file, input, ts.ScriptTarget.Latest, true)
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const interfaces = source.statements.filter(ts.isInterfaceDeclaration)
const interfaceByName = new Map(interfaces.map(node => [node.name.text, node]))
const description = node => node.jsDoc?.map(doc => typeof doc.comment === 'string' ? doc.comment : '').join('\n') ?? ''
const fields = (name, visiting = new Set()) => {
    if (visiting.has(name)) throw new Error(`Cyclic root API interface inheritance at ${name}`)
    const declaration = interfaceByName.get(name)
    if (!declaration) throw new Error(`Unknown root API interface: ${name}`)
    const nextVisiting = new Set(visiting).add(name)
    const inherited = (declaration.heritageClauses ?? []).flatMap(clause => clause.types.flatMap(type =>
        fields(type.expression.getText(source), nextVisiting)))
    const own = declaration.members.map(node => ({
        name: node.name.getText(source),
        type: node.type.getText(source),
        description: description(node),
        default: ts.getJSDocTags(node).find(tag => tag.tagName.text === 'default')?.comment,
        source: { file: navigationFile, offset: node.name.getStart(source) },
    }))
    return [...new Map([...inherited, ...own].map(field => [field.name, field])).values()]
}
const props = fields('VuetrexProps')
const settings = fields('VxSettings')
const ready = fields('VuetrexEvents')[0]
const sceneErrorEvent = fields('VuetrexEvents')[1]
const composerStatusEvent = fields('VuetrexEvents')[2]
const table = rows => '| Name | Type | Default | Description |\n| --- | --- | --- | --- |\n' + rows.map(row =>
    `| \`${row.name}\` | \`${row.type.replaceAll('|', '\\|')}\` | \`${row.default ?? '—'}\` | ${row.description} |`,
).join('\n')
const webTypes = {
    $schema: 'https://raw.githubusercontent.com/JetBrains/web-types/master/schema/web-types.json',
    name: pkg.name,
    version: pkg.version,
    framework: 'vue',
    'js-types-syntax': 'typescript',
    'description-markup': 'markdown',
    contributions: { html: { elements: [{
        name: 'Vuetrex',
        description: description(interfaces.find(node => node.name.text === 'VuetrexProps')),
        source: { file: navigationFile, offset: interfaces[0].name.getStart(source) },
        attributes: props.map(prop => ({
            ...prop,
            type: undefined,
            required: false,
            value: { kind: 'expression', type: ['VxSettings', 'ElementRegistry', 'VxCameraView', 'VxColorScheme'].includes(prop.type)
                ? { module: pkg.name, name: prop.type } : prop.type },
            ...(prop.name === 'settings' ? { 'description-sections': { 'All settings': table(settings) } } : {}),
        })),
        events: [{ name: 'ready', description: ready.description, source: ready.source,
            arguments: [{ name: 'stage', type: { module: pkg.name, name: 'VxStage' } }] },
            { name: 'scene-error', description: sceneErrorEvent.description, source: sceneErrorEvent.source,
                arguments: [{ name: 'error', type: { module: pkg.name, name: 'VxSceneError' } }] },
            { name: 'composer-status', description: composerStatusEvent.description, source: composerStatusEvent.source,
                arguments: [{ name: 'status', type: { module: pkg.name, name: 'ComposerDiagnostics' } }] }],
        slots: [{ name: 'default', description: 'The scene tree rendered by Vuetrex. Required to create a stage.' }],
    }] } },
}
const rootApiTypes = new Set([
    'VxLayoutSize', 'VxAlignment', 'VxLayoutName', 'VxLayoutDirection', 'VxFitMode',
    'VxMaterialBinding', 'VxHoverProps', 'GeometrySource', 'GeometryParameterValues',
    'GeometryMaterialChannels', 'GeometryEffectChannels', 'GeometryAnchor', 'Placement',
])
const elementAttributes = type => fields(type).map(field => ({
    name: field.name.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`),
    description: field.description,
    default: field.default,
    required: false,
    value: {
        kind: 'expression',
        type: rootApiTypes.has(field.type) ? { module: pkg.name, name: field.type } : field.type,
    },
    source: field.source,
}))
const nodeEvents = ['click', 'dblclick', 'pointerenter', 'pointerleave'].map(name => ({
    name,
    description: name.startsWith('pointer')
        ? 'Pointer boundary event for this node; it does not bubble through the logical tree.'
        : 'Pointer activation event for this node; it bubbles through the logical tree.',
}))
for (const [name, type, tagDescription, acceptsChildren] of [
    ['vx-group', 'VxGroupProps', 'Spatial container with selectable grid, row, depth, stack, or ring layout.', true],
    ['vx-row', 'VxGroupProps', 'Spatial container that arranges children along the X axis.', true],
    ['vx-stack', 'VxGroupProps', 'Spatial container that stacks children along the Y axis.', true],
    ['vx-ring', 'VxRingProps', 'Spatial container that arranges children around an XZ ring.', true],
    ['vx-layer', 'VxLayerProps', 'Depth-layout container and scaling boundary.', true],
    ['vx-panel', 'VxPanelProps', 'Visual rounded-box container with independent label and child-layout regions.', true],
    ['vx-spacer', 'VxSpacerProps', 'Non-visual node that reserves an explicit slot in its parent layout.', false],
    ['vx-box', 'VxMeshProps', 'Fixed rounded box geometry. A positive depth overrides its Z extent.', false],
    ['vx-cylinder', 'VxMeshProps', 'Fixed beveled cylinder geometry.', false],
    ['vx-wedge', 'VxWedgeProps', 'Fixed beveled ring-segment geometry designed for vx-ring layouts.', false],
    ['vx-instances', 'VxInstanceProps', 'Keyed repeated geometry realized as one instanced mesh.', false],
    ['vx-geometry', 'VxGeometryProps', 'One immutable procedural geometry graph compiled into keyed render batches.', false],
]) {
    webTypes.contributions.html.elements.push({
        name,
        description: tagDescription,
        attributes: elementAttributes(type),
        events: nodeEvents,
        ...(acceptsChildren ? { slots: [{ name: 'default', description: 'Spatial children arranged by this container.' }] } : {}),
    })
}
const declarationsFile = 'src/lib-components/connectors/template-api.d.ts'
const declarationsInput = await readFile(declarationsFile, 'utf8')
const declarationsSource = ts.createSourceFile(declarationsFile, declarationsInput, ts.ScriptTarget.Latest, true)
const declarationInterfaces = declarationsSource.statements.filter(ts.isInterfaceDeclaration)
const declarationFields = name => declarationInterfaces.find(node => node.name.text === name).members.map(node => ({
    name: node.name.getText(declarationsSource).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`),
    required: !node.questionToken,
    value: { kind: 'expression', type: node.type.getText(declarationsSource) },
    source: { file: 'dist_types/' + declarationsFile, offset: node.name.getStart(declarationsSource) },
}))
const presentation = declarationFields('ConnectorPresentation')
for (const [name, type, description] of [
    ['vx-connectors', 'ConnectorHostProps', 'Non-spatial connector host. Use either graph or keyed vx-edge children. Supply a scope for stable public handles.'],
    ['vx-edge', 'ConnectorEdgeDeclarationRecord', 'Keyed relationship. Literal endpoints use node or node.port; bind structured endpoints for dotted IDs. A direct spatial parent supplies the source node and scope.'],
    ['vx-port', 'ConnectorPortDeclarationRecord', 'Named local port on an explicit spatial owner ID. Use position/normal or face/at; overrides must reference a built-in name.'],
]) {
    webTypes.contributions.html.elements.push({ name, description,
        attributes: [...declarationFields(type), ...(name === 'vx-port' ? [] : presentation)],
        ...(name === 'vx-port' ? {} : { events: ['click', 'dblclick', 'pointerenter', 'pointerleave'].map(name => ({ name,
            description: 'Receives the connector hit, including its public scope/key handle, and the original mouse event.' })) }),
    })
}
const composerFile = 'src/lib-components/scene/composer-api.d.ts'
const composerInput = await readFile(composerFile, 'utf8')
const composerSource = ts.createSourceFile(composerFile, composerInput, ts.ScriptTarget.Latest, true)
const composerInterface = composerSource.statements.find(node => ts.isInterfaceDeclaration(node) && node.name.text === 'VxComposerOptions')
webTypes.contributions.html.elements.push({
    name: 'vx-composer',
    description: 'Host-only final-image configuration. One declaration is allowed per Vuetrex scene.',
    attributes: composerInterface.members.map(node => ({
        name: node.name.getText(composerSource).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`),
        required: false,
        value: { kind: 'expression', type: node.type.getText(composerSource) },
        source: { file: 'dist_types/' + composerFile, offset: node.name.getStart(composerSource) },
    })),
})
const reference = `---
title: Vuetrex root component
description: All root attributes, settings, events, and editor support in one place.
outline: deep
---

<!-- Generated by scripts/generate-root-api.mjs from src/lib-components/root-api.d.ts. -->

# Vuetrex root component

Import \`Vuetrex\` locally. Both \`<Vuetrex>\` and \`<vuetrex>\` work in Vue templates.

\`\`\`vue
<script setup lang="ts">
import { Vuetrex, type VxSettings, type VxStage } from '@exceeder/vuetrex'

const settings = {
  backgroundColor: 0x85898d,
  floorFadeStart: 20,
  floorFadeEnd: 50,
} satisfies VxSettings

function onReady(stage: VxStage) {
  // Stage controls are available; the inner scene mounts on the next Vue tick.
  stage.setDiagnostics(false)
}
</script>

<template>
  <Vuetrex height="520px" :settings="settings" @ready="onReady">
    <vx-box />
  </Vuetrex>
</template>
\`\`\`

## Attributes

${table(props)}

CSS dimensions and positioning, \`camera\`, \`stopped\`, \`sheets\`, and \`scheme\` respond to changes. \`settings\` and \`elements\` are
read at mount. To replace initial configuration, change the component's Vue \`key\` to remount it.
Standard Vue \`class\` and \`style\` attributes fall through to the wrapper.

## Settings

Settings are fields of the \`:settings\` object, not individual template attributes.
Use \`satisfies VxSettings\` (or \`: VxSettings\`) for completion, hover documentation, and checking of object fields.
Colors use numeric RGB values such as \`0x85898d\`; distances use world units.

${table(settings)}

### Fog settings

${table(fields('VxFogSettings'))}

### Diagnostic settings

These flags apply when \`settings.diagnostics\` is an object. With \`false\` all overlays are disabled;
with \`true\` all are enabled.

${table(fields('VxDiagnosticsSettings'))}

## Camera animation

The camera prop also accepts an explicit orbit. See [camera orbit timelines](/api/stage#camera-orbit-timelines)
for an initial-pose example and stage-owned GSAP animation.

## Events and slot

\`@ready="onReady"\` receives a \`VxStage\`. ${ready.description}
See the [stage methods](/api/stage).

\`@scene-error="onSceneError"\` receives a \`VxSceneError\` in development and production.
It includes the failing tag, optional node ID/property, phase, message, correction, and original cause.
Development builds also show a dismissible error panel inside the scene. See
[scene errors](/guide/scene-errors) for recovery and production handling.

\`@composer-status="onComposerStatus"\` receives a deduplicated \`ComposerDiagnostics\` snapshot when the requested
or effective post-processing plan changes or a fallback occurs. It is not a per-frame event.

The **default slot** holds the scene tree. Omitting it prevents stage creation.

## IntelliJ IDEA / WebStorm

Enable Vue support and import \`Vuetrex\` from the package in your component. The package supplies
\`web-types.json\` for root-tag attributes, defaults, documentation, and navigation targets.
The navigation target is the annotated \`root-api.d.ts\` contract, included in the package; settings fields
are also documented in the emitted TypeScript declarations.

Evaluate attribute completion on \`<Vuetrex>\`, Quick Documentation on \`settings\` or \`stopped\`, and
Go to Declaration on attributes. Exact navigation behavior depends on which Vue/TypeScript provider IDEA selects.
The metadata covers the root component, layout containers, fixed meshes, procedural geometry, and the existing
connector/composer host declarations. Runtime classes and TypeScript contracts for the supported layout and geometry
extension surface are exported from the package root.

Maintainers: run \`node scripts/generate-root-api.mjs\` after editing the root interfaces.
The build regenerates these files; \`node scripts/generate-root-api.mjs --check\` detects stale output.
`
for (const [path, output] of [['web-types.json', JSON.stringify(webTypes, null, 2) + '\n'], ['docs/api/vuetrex.md', reference]]) {
    if (process.argv.includes('--check')) {
        if (await readFile(path, 'utf8') !== output) throw new Error(`${path} is stale; run node scripts/generate-root-api.mjs`)
    } else await writeFile(path, output)
}
