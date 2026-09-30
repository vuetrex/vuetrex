import type { VxSceneError } from './diagnostics/sceneErrors.js'
import type { ElementRegistry } from './nodes/types.js'
import type { VxStage } from './three/stage.js'
import type { VxCameraView } from './three/cameraController.js'
import type { VxColorScheme, VxStyleSheetDefinition } from './styling/stylesheets.js'
import type { ComposerDiagnostics } from './three/postprocessing/ComposerController.js'
import type { Placement } from './composition/index.js'
import type { GeometryParameterValues, GeometrySource } from './geometry/types.js'
import type { GeometryAnchor, GeometryEffectChannels, GeometryMaterialChannels } from './geometry/GeometryNode.js'
import type { VxNodeEffects } from './scene/composer.js'
import type { VxHoverProps } from './styling/types.js'
import type { VxMaterialBinding } from './styling/stylesheets.js'
import type { InstanceAnchor, InstanceEncoding, InstanceGeometry, InstanceKey } from './nodes/InstanceNode.js'

/** Root scene container. Import Vuetrex and place the scene in its default slot. */
export interface VuetrexProps {
    /** Initial scene configuration. Read once at mount; remount with a new key to replace settings.
     * @default {}
     */
    settings?: VxSettings
    /** Wrapper CSS positioning mode.
     * @default "static"
     */
    position?: string
    /** Wrapper CSS height, including units (for example "520px" or "70vh").
     * @default "50vh"
     */
    height?: string
    /** Wrapper CSS width, including units. The wrapper has a 4096px maximum width.
     * @default "100%"
     */
    width?: string
    /** Pause rendering and stage animations. Changes take effect reactively.
     * @default false
     */
    stopped?: boolean
    /** Ordered style definitions for this scene. Overrides sheets inherited from a `vx-stylesheet` provider; changes apply reactively. */
    sheets?: readonly VxStyleSheetDefinition[]
    /** Color scheme for this scene. Overrides the scheme inherited from a `vx-stylesheet` provider; `system` follows the browser preference. */
    scheme?: VxColorScheme
    /** Node name/ID, "scene" for automatic fitting, or { orbit } for an explicit initial pose. Applied before ready; reactive changes replace camera animation.
     * @default "scene"
     */
    camera?: VxCameraView
    /** Currently unused by the renderer. Supply scene content through the default slot.
     * @default []
     */
    items?: unknown[]
    /** Custom host constructors registered for this scene. Read once at mount.
     * @default {}
     */
    elements?: ElementRegistry
}

/** Events emitted by the root component. */
export interface VuetrexEvents {
    /** Emitted once after stage mounting, before the inner scene tree mounts on the next Vue tick.
     * The payload provides the public stage controls; content bounds are not ready yet.
     */
    ready: [stage: VxStage]
    /** Structured scene failure, emitted in development and production. Includes tag, optional node ID/property, phase, correction, and original cause. */
    'scene-error': [error: VxSceneError]
    /** Emitted when the requested/effective composer plan or a fallback changes; never emitted per frame. */
    'composer-status': [status: ComposerDiagnostics]
}

/** Initial settings for Vuetrex. Colors are numeric RGB values such as 0x85898d; distances use world units. */
export interface VxSettings {
    /** Default node color. Zero currently falls back to the default.
     * @default 0x555555
     */
    color?: number
    /** Solid scene background color.
     * @default 0x808080
     */
    backgroundColor?: number
    /** Floor contribution over its reflection, clamped to 0–1. Lower values reveal more reflection; 1 skips the reflection pass.
     * @default 0.55
     */
    mirrorOpacity?: number
    /** Floor texture color. When omitted, the reflection tint separately defaults to 0x777777.
     * @default 0x3f3f3f
     */
    floorColor?: number
    /** World X/Z extent where floor fading begins. Set with floorFadeEnd; requires 0 <= start < end. Objects are unaffected.
     * @default undefined (disabled)
     */
    floorFadeStart?: number
    /** World X/Z extent where the floor matches the background. For example, start 20 and end 50 preserve the central 40-by-40 area.
     * @default undefined (disabled)
     */
    floorFadeEnd?: number
    /** Default interactive highlight color. Zero currently falls back to the default.
     * @default 0x4c7fb2
     */
    highlightColor?: number
    /** Default connector color.
     * @default 0xa0ffff
     */
    connectorColor?: number
    /** Floor caption and grid color.
     * @default 0xffffff
     */
    captionColor?: number
    /** First directional light color. Zero currently falls back to the default.
     * @default 0xccffff
     */
    lightColor1?: number
    /** Second directional light color. Zero currently falls back to the default.
     * @default 0xffffff
     */
    lightColor2?: number
    /** Currently unused: the stage does not create a third light.
     * @default undefined
     */
    lightColor3?: number
    /** Base geometry unit in world units. Zero currently falls back to 1.
     * @default 1
     */
    unit?: number
    /** Default container spacing in world units.
     * @default 1
     */
    gap?: number
    /** Linear camera-distance fog affecting the scene. Use floorFadeStart/floorFadeEnd to fade only the floor.
     * @default undefined (disabled)
     */
    fog?: VxFogSettings
    /** Enable all diagnostic overlays with true, or configure individual overlays. Omitted flags in an object are enabled.
     * @default false
     */
    diagnostics?: boolean | VxDiagnosticsSettings
    /** Draw the floor grid.
     * @default true
     */
    floorGrid?: boolean
    /** Enable floor reflections. mirrorOpacity=1 also disables the reflection pass.
     * @default true
     */
    floorMirror?: boolean
    /** Draw node captions on the floor.
     * @default true
     */
    floorCaptions?: boolean
    /** Enable renderer shadow maps, shadow lights, and mesh shadow flags.
     * @default true
     */
    shadows?: boolean
}

/** Optional scene fog, measured from the camera rather than from the world origin. */
export interface VxFogSettings {
    /** Camera distance where fog starts. Negative values are clamped to zero.
     * @default 18
     */
    near?: number
    /** Camera distance where fog is complete. Clamped to at least near + 0.001.
     * @default 42
     */
    far?: number
    /** Fog color; inherits the scene background when omitted.
     * @default settings.backgroundColor or 0x808080
     */
    color?: number
}

/** Diagnostic overlays. These defaults apply when a diagnostics object is supplied. */
export interface VxDiagnosticsSettings {
    /** Show spatial group bounds.
     * @default true
     */
    groupBounds?: boolean
    /** Show ground footprints.
     * @default true
     */
    footprints?: boolean
    /** Show connector attachment ports.
     * @default true
     */
    connectionPorts?: boolean
    /** Show node IDs.
     * @default true
     */
    nodeIds?: boolean
}

/** Shared template props for spatial layout and geometry nodes. */
export interface VxNodeProps {
    /** Stable semantic identity used by focus, animation, diagnostics, and connections. */
    id?: string
    /** Human-readable identity. Use `id` for machine references and `text` for captions. */
    name?: string
    /** Floor caption where supported by the node. */
    text?: string
    /** Show the node while retaining its layout slot.
     * @default true
     */
    visible?: boolean
    /** Suppress pointer and click handling without hiding the node.
     * @default false
     */
    disabled?: boolean
    /** Include the node in parent measurement and automatic placement.
     * @default true
     */
    participatesInLayout?: boolean
    /** Composer contribution policy for this node and its descendants. */
    effects?: Readonly<VxNodeEffects>
}

/** Plain or Three.js-compatible size accepted by layout containers and spacers. */
export type VxLayoutSize = number | Readonly<{ x: number; y?: number; z?: number }>
export type VxAlignment = 'start' | 'center' | 'end'
export type VxLayoutName = 'grid' | 'row' | 'depth' | 'stack' | 'ring'
export type VxLayoutDirection = 'normal' | 'reverse'
export type VxFitMode = 'shrink' | 'none'

/** Props shared by vx-group, vx-row, and vx-stack. */
export interface VxGroupProps extends VxNodeProps {
    /** Declared X/Z size or `{ x, y, z }` allocation. */
    size?: VxLayoutSize
    /** Declared vertical allocation. */
    height?: number
    /** Gap between automatically arranged children, in world units. */
    gap?: number
    /** Set all three alignment axes together. */
    align?: VxAlignment
    alignX?: VxAlignment
    alignY?: VxAlignment
    alignZ?: VxAlignment
    /** Override the container's built-in layout strategy. */
    layout?: VxLayoutName
    /** Ring start angle in degrees. */
    startAngle?: number
    direction?: VxLayoutDirection
    /** Shrink oversized content into declared bounds or allow overflow.
     * @default "shrink"
     */
    fit?: VxFitMode
    /** Recipe-owned position, orientation, scale, and visibility. */
    placement?: Placement
}

/** Props specific to vx-layer in addition to the shared group contract. */
export interface VxLayerProps extends VxGroupProps {
    /** Uniform scale applied at this layout boundary.
     * @default 1
     */
    scale?: number
    /** Vertical offset from the parent layout, in world units.
     * @default 0
     */
    elevation?: number
}

/** Props specific to vx-ring in addition to the shared group contract. */
export interface VxRingProps extends VxGroupProps {
    /** Explicit outer ring radius. Omit to derive it from child footprints. */
    radius?: number
    /** Fraction of each angular slot reserved as a gap, from 0 inclusive to 1 exclusive. */
    gapRatio?: number
}

/** Props for the non-visual vx-spacer layout reservation. */
export interface VxSpacerProps extends VxNodeProps {
    /** Shorthand for equal width/depth, or an explicit three-dimensional size. */
    size?: VxLayoutSize
    width?: number
    height?: number
    depth?: number
}

/** Props for the visual vx-panel layout container. */
export interface VxPanelProps extends VxNodeProps {
    size?: number
    depth?: number
    height?: number
    lines?: readonly string[]
    labelRegion?: 'north' | 'south'
    labelShare?: number
    labelPadding?: number
    labelColor?: number
    labelFontSize?: number
    labelLineHeight?: number
    labelAlign?: 'left' | 'center' | 'right'
    contentPadding?: number
    layout?: VxLayoutName
    gap?: number
    startAngle?: number
    direction?: VxLayoutDirection
    material?: VxMaterialBinding
    hover?: VxHoverProps
}

/** Shared props for fixed shapes derived from MeshNode. */
export interface VxMeshProps extends VxNodeProps {
    /** Shape width and default Z depth.
     * @default 1
     */
    size?: number
    /** Exact vertical extent.
     * @default 0.5
     */
    height?: number
    /** Box Z extent; radial shapes ignore it.
     * @default 0
     */
    depth?: number
    /** Multi-line SDF label rendered on the mesh face. */
    lines?: readonly string[]
    labelFace?: 'front' | 'top'
    labelColor?: number
    labelPadding?: number
    labelFontSize?: number
    labelLineHeight?: number
    labelAlign?: 'left' | 'center' | 'right'
    material?: VxMaterialBinding
    hover?: VxHoverProps
}

/** Additional fixed-geometry props accepted by vx-wedge. */
export interface VxWedgeProps extends VxMeshProps {
    /** Radial thickness of the ring segment. */
    thickness?: number
}

/** Props for keyed repeated geometry hosted by one vx-instances node. */
export interface VxInstanceProps<Item = unknown> extends VxNodeProps {
    items?: readonly Item[]
    keyBy?: InstanceKey<Item>
    encoding?: InstanceEncoding<Item>
    geometry?: InstanceGeometry
    material?: VxMaterialBinding
    /** How encoded bounds align with the parent layout.
     * @default "base"
     */
    anchor?: InstanceAnchor
}

/** Props for one immutable procedural geometry graph hosted by vx-geometry. */
export interface VxGeometryProps extends VxNodeProps {
    graph?: GeometrySource
    parameters?: GeometryParameterValues
    material?: VxMaterialBinding
    materials?: GeometryMaterialChannels
    materialEffects?: GeometryEffectChannels
    /** How compiled bounds align with the parent layout.
     * @default "base"
     */
    anchor?: GeometryAnchor
}
