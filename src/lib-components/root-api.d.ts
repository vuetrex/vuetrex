import type { VxSceneError } from './diagnostics/sceneErrors.js'
import type { ElementRegistry } from './nodes/types.js'
import type { VxStage } from './three/stage.js'
import type { VxCameraView } from './three/cameraController.js'
import type { VxColorScheme, VxStyleSheetDefinition } from './styling/stylesheets.js'

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
