import { reactive, watch, watchEffect, type WatchStopHandle } from 'vue'
import {
    CanvasTexture,
    CylinderGeometry,
    DoubleSide,
    Group,
    LinearFilter,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    PlaneGeometry,
    RepeatWrapping,
    SRGBColorSpace,
    Vector3,
} from 'three'
import * as THREEx from '@/lib-components/three/three.imports.js'
import { Node } from '@/lib-components/nodes/Node.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

export type VxDisplayWallMode = 'continuous' | 'displays'
export type VxDisplayWallShape = 'flat' | 'curved'

export interface VxDisplayPaintContext {
    canvas: HTMLCanvasElement
    context: CanvasRenderingContext2D
    width: number
    height: number
    index: number
    id: string
}

export interface VxDisplaySurface {
    id?: string
    background?: string
    canvas?: CanvasImageSource
    svg?: string
    paint?: (target: VxDisplayPaintContext) => void
}

interface DisplayWallState {
    text: string
    mode: VxDisplayWallMode
    shape: VxDisplayWallShape
    width: number
    height: number
    radius: number
    arc: number
    thickness: number
    bezel: number
    segments: number
    displayWidth: number
    frameColor: number
    textureWidth: number
    textureHeight: number
    surface?: VxDisplaySurface
    surfaces: VxDisplaySurface[]
}

interface ScreenRecord {
    canvas: HTMLCanvasElement
    context: CanvasRenderingContext2D
    texture: CanvasTexture
    mesh: Mesh
    loadToken: number
}

interface DisplayWallGeometryConfig {
    mode: VxDisplayWallMode
    shape: VxDisplayWallShape
    width: number
    height: number
    radius: number
    arc: number
    thickness: number
    bezel: number
    segments: number
    displayWidth: number
    frameColor: number
    textureWidth: number
    textureHeight: number
    displayCount: number
}

/** A curved display uses 128 radial segments by default, twice the old wall resolution. */
export function createDisplayWallGeometry(
    radius: number,
    height: number,
    arc: number,
    segments = 128,
): CylinderGeometry {
    return new CylinderGeometry(
        radius,
        radius,
        height,
        Math.max(8, Math.round(segments)),
        1,
        true,
        Math.PI - arc / 2,
        arc,
    )
}

/**
 * Canvas-backed wall display. A continuous wall owns one texture; display-set
 * mode realizes a short list of independently textured screens.
 */
export class DisplayWall extends Node {
    public readonly type = 'DisplayWall'
    private readonly root = new Group()
    private stopHandles: WatchStopHandle[] = []
    private screens: ScreenRecord[] = []

    declare protected state: DisplayWallState

    constructor(stage: VuetrexStage) {
        super(stage)
        this.state = reactive({
            text: '',
            mode: 'continuous',
            shape: 'curved',
            width: 11,
            height: 4.8,
            radius: 7.2,
            arc: 110,
            thickness: 0.14,
            bezel: 0.12,
            segments: 128,
            displayWidth: 0,
            frameColor: 0x3f4944,
            textureWidth: 1536,
            textureHeight: 768,
            surface: undefined,
            surfaces: [],
        }) as DisplayWallState
        this.element.mesh = this.root as any
    }

    protected override intrinsicSize(): Vector3 {
        const arc = this.arcRadians()
        const width = this.state.shape === 'flat'
            ? this.state.width
            : 2 * this.state.radius * Math.sin(arc / 2)
        const depth = this.state.shape === 'flat'
            ? this.state.thickness
            : this.state.radius * (1 - Math.cos(arc / 2)) + this.state.thickness
        return new Vector3(width, this.state.height, depth)
    }

    override setStateValue(key: string, value: any): void {
        if (key === 'mode') {
            if (value === 'continuous' || value === 'displays') this.state.mode = value
            return
        }
        if (key === 'shape') {
            if (value === 'flat' || value === 'curved') this.state.shape = value
            return
        }
        super.setStateValue(key, value)
    }

    syncWithThree(): void {
        if (this.stopHandles.length > 0) return

        this.stopHandles.push(watchEffect(() => {
            const parent = this.nearestAncestorObject()
            if (this.root.parent !== parent) parent.add(this.root)
            this.root.name = `el-${this.id}`
            this.root.userData.el = this.element
            this.root.position.copy(this.element.getPosition())
            this.applyObjectState(this.root)
            this.stage.invalidateContentBounds?.()
        }))

        this.stopHandles.push(watch(() => [
            this.state.mode,
            this.state.shape,
            this.state.width,
            this.state.height,
            this.state.radius,
            this.state.arc,
            this.state.thickness,
            this.state.bezel,
            this.state.segments,
            this.state.displayWidth,
            this.state.frameColor,
            this.state.textureWidth,
            this.state.textureHeight,
            this.state.mode === 'displays' ? this.state.surfaces.length : 1,
        ].join('|'), () => {
            const geometry: DisplayWallGeometryConfig = {
                mode: this.state.mode,
                shape: this.state.shape,
                width: this.state.width,
                height: this.state.height,
                radius: this.state.radius,
                arc: this.state.arc,
                thickness: this.state.thickness,
                bezel: this.state.bezel,
                segments: this.state.segments,
                displayWidth: this.state.displayWidth,
                frameColor: this.state.frameColor,
                textureWidth: this.state.textureWidth,
                textureHeight: this.state.textureHeight,
                displayCount: this.state.mode === 'displays' ? Math.max(1, this.state.surfaces.length) : 1,
            }
            this.rebuild(geometry)
            this.stage.invalidateContentBounds?.()
        }, { immediate: true }))

        this.stopHandles.push(watchEffect(() => {
            const surfaces = this.state.mode === 'continuous'
                ? [this.state.surface ?? {}]
                : this.state.surfaces
            this.screens.forEach((screen, index) => this.paintScreen(screen, surfaces[index] ?? {}, index))
        }))
    }

    private arcRadians(): number {
        return Math.max(THREE_EPSILON, Math.min(Math.PI * 1.9, this.state.arc * Math.PI / 180))
    }

    private rebuild(config: DisplayWallGeometryConfig): void {
        this.clearVisuals()
        const frameMaterial = new MeshStandardMaterial({
            color: config.frameColor,
            roughness: 0.56,
            metalness: 0.18,
            side: DoubleSide,
        })

        if (config.mode === 'continuous') {
            this.buildContinuous(config, frameMaterial)
        } else {
            this.buildDisplays(config, frameMaterial)
        }
    }

    private buildContinuous(
        config: DisplayWallGeometryConfig,
        frameMaterial: MeshStandardMaterial,
    ): void {
        const height = Math.max(0.1, config.height)
        const bezel = Math.max(0.02, Math.min(config.bezel, height / 4))
        const thickness = Math.max(0.01, config.thickness)

        if (config.shape === 'curved') {
            const radius = Math.max(0.5, config.radius)
            const arc = Math.max(THREE_EPSILON, Math.min(Math.PI * 1.9, config.arc * Math.PI / 180))
            const frame = new Mesh(createDisplayWallGeometry(radius, height, arc, config.segments), frameMaterial)
            const outer = new Mesh(
                createDisplayWallGeometry(radius + thickness, height, arc, config.segments),
                frameMaterial,
            )
            this.root.add(frame, outer)

            const screenArc = Math.max(THREE_EPSILON, arc - 2 * bezel / radius)
            const screen = this.createScreen(
                createDisplayWallGeometry(
                    radius - Math.min(thickness * 0.35, radius * 0.02),
                    Math.max(0.08, height - bezel * 2),
                    screenArc,
                    config.segments,
                ),
                config.textureWidth,
                config.textureHeight,
                true,
            )
            this.root.add(screen.mesh)
            return
        }

        const width = Math.max(0.1, config.width)
        const frame = new Mesh(new THREEx.RoundedBoxGeometry(width, height, thickness, 8, 0.08), frameMaterial)
        this.root.add(frame)
        const screen = this.createScreen(
            new PlaneGeometry(Math.max(0.08, width - bezel * 2), Math.max(0.08, height - bezel * 2)),
            config.textureWidth,
            config.textureHeight,
            false,
        )
        screen.mesh.position.z = thickness / 2 + 0.002
        this.root.add(screen.mesh)
    }

    private buildDisplays(
        config: DisplayWallGeometryConfig,
        frameMaterial: MeshStandardMaterial,
    ): void {
        const count = config.displayCount
        const height = Math.max(0.1, config.height)
        const thickness = Math.max(0.01, config.thickness)
        const bezel = Math.max(0.02, Math.min(config.bezel, height / 4))
        const arc = Math.max(THREE_EPSILON, Math.min(Math.PI * 1.9, config.arc * Math.PI / 180))
        const slot = arc / count
        const automaticWidth = config.shape === 'curved'
            ? 2 * Math.max(0.5, config.radius) * Math.sin(slot / 2) * 0.86
            : Math.max(0.1, config.width / count - bezel)
        const panelWidth = Math.max(0.1, config.displayWidth > 0 ? config.displayWidth : automaticWidth)

        for (let index = 0; index < count; index++) {
            const panel = new Group()
            if (config.shape === 'curved') {
                const angle = -arc / 2 + slot * (index + 0.5)
                panel.position.set(
                    config.radius * Math.sin(angle),
                    0,
                    -config.radius * Math.cos(angle),
                )
                panel.rotation.y = -angle
            } else {
                panel.position.x = (index - (count - 1) / 2) * (panelWidth + bezel)
            }

            const frame = new Mesh(
                new THREEx.RoundedBoxGeometry(panelWidth, height, thickness, 8, Math.min(0.08, bezel * 0.6)),
                frameMaterial,
            )
            panel.add(frame)
            const screen = this.createScreen(
                new PlaneGeometry(
                    Math.max(0.08, panelWidth - bezel * 2),
                    Math.max(0.08, height - bezel * 2),
                ),
                config.textureWidth,
                config.textureHeight,
                false,
            )
            screen.mesh.position.z = thickness / 2 + 0.002
            panel.add(screen.mesh)
            this.root.add(panel)
        }
    }

    private createScreen(
        geometry: CylinderGeometry | PlaneGeometry,
        requestedWidth: number,
        requestedHeight: number,
        flipHorizontal: boolean,
    ): ScreenRecord {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(64, Math.round(requestedWidth))
        canvas.height = Math.max(64, Math.round(requestedHeight))
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Vuetrex display walls require a 2D canvas context')

        const texture = new CanvasTexture(canvas)
        texture.colorSpace = SRGBColorSpace
        texture.minFilter = LinearFilter
        texture.magFilter = LinearFilter
        if (flipHorizontal) {
            texture.wrapS = RepeatWrapping
            texture.repeat.x = -1
            texture.offset.x = 1
        }
        const material = new MeshBasicMaterial({ map: texture, side: DoubleSide, toneMapped: false })
        const mesh = new Mesh(geometry, material)
        mesh.name = `el-${this.id}-display-${this.screens.length}`
        mesh.userData.el = this.element
        mesh.renderOrder = 2
        const record = { canvas, context, texture, mesh, loadToken: 0 }
        this.screens.push(record)
        return record
    }

    private paintScreen(screen: ScreenRecord, surface: VxDisplaySurface, index: number): void {
        const { canvas, context, texture } = screen
        screen.loadToken += 1
        context.save()
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = surface.background ?? '#111719'
        context.fillRect(0, 0, canvas.width, canvas.height)
        if (surface.canvas) context.drawImage(surface.canvas, 0, 0, canvas.width, canvas.height)
        surface.paint?.({
            canvas,
            context,
            width: canvas.width,
            height: canvas.height,
            index,
            id: surface.id ?? `display-${index}`,
        })
        context.restore()
        texture.needsUpdate = true

        if (surface.svg && typeof Image !== 'undefined') {
            const token = screen.loadToken
            const image = new Image()
            image.onload = () => {
                if (token !== screen.loadToken) return
                context.drawImage(image, 0, 0, canvas.width, canvas.height)
                texture.needsUpdate = true
            }
            image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(surface.svg)}`
        }
    }

    private clearVisuals(): void {
        for (const screen of this.screens) screen.loadToken += 1
        this.root.traverse(object => {
            const mesh = object as Mesh
            mesh.geometry?.dispose()
            const materials = mesh.material
                ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
                : []
            for (const material of materials) {
                const map = (material as MeshBasicMaterial).map
                map?.dispose()
                material.dispose()
            }
        })
        this.root.clear()
        this.screens = []
    }

    onRemoved(): void {
        this.stopHandles.forEach(stop => stop())
        this.stopHandles = []
        this.clearVisuals()
        this.root.removeFromParent()
        this.stage.connectors.remove(this.element)
        this.stage.invalidateContentBounds?.()
    }
}

const THREE_EPSILON = 1e-4
