import { watchSceneEffect, watchScene } from '../diagnostics/sceneErrors.js'
import { reactive, watch, watchEffect, type WatchStopHandle } from 'vue'
import {
    BufferGeometry,
    CanvasTexture,
    CylinderGeometry,
    DoubleSide,
    Float32BufferAttribute,
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
    shape: VxDisplayWallShape
    width: number
    height: number
    radius: number
    arc: number
    thickness: number
    bezel: number
    segments: number
    frameColor: number
    textureWidth: number
    textureHeight: number
    surface?: VxDisplaySurface
}

interface ScreenRecord {
    canvas: HTMLCanvasElement
    context: CanvasRenderingContext2D
    texture: CanvasTexture
    mesh: Mesh
    loadToken: number
}

interface DisplayWallGeometryConfig {
    shape: VxDisplayWallShape
    width: number
    height: number
    radius: number
    arc: number
    thickness: number
    bezel: number
    segments: number
    frameColor: number
    textureWidth: number
    textureHeight: number
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

/** Close the two radial ends of a curved wall shell. */
export function createDisplayWallEndCaps(
    innerRadius: number,
    outerRadius: number,
    height: number,
    arc: number,
): BufferGeometry {
    const positions: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    const halfHeight = height / 2
    const angles = [Math.PI - arc / 2, Math.PI + arc / 2]

    angles.forEach(angle => {
        const base = positions.length / 3
        const sin = Math.sin(angle)
        const cos = Math.cos(angle)
        positions.push(
            innerRadius * sin, -halfHeight, innerRadius * cos,
            outerRadius * sin, -halfHeight, outerRadius * cos,
            outerRadius * sin, halfHeight, outerRadius * cos,
            innerRadius * sin, halfHeight, innerRadius * cos,
        )
        uvs.push(0, 0, 1, 0, 1, 1, 0, 1)
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    })

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
}

/**
 * Canvas-backed wall display with one reactive texture surface.
 */
export class DisplayWall extends Node {
    public readonly type = 'DisplayWall'
    private readonly root = new Group()
    private stopHandles: WatchStopHandle[] = []
    private screen?: ScreenRecord

    declare protected state: DisplayWallState

    constructor(stage: VuetrexStage) {
        super(stage)
        this.state = reactive({
            text: '',
            shape: 'curved',
            width: 11,
            height: 4.8,
            radius: 7.2,
            arc: 110,
            thickness: 0.14,
            bezel: 0.12,
            segments: 128,
            frameColor: 0x3f4944,
            textureWidth: 1536,
            textureHeight: 768,
            surface: undefined,
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
        if (key === 'shape') {
            if (value === 'flat' || value === 'curved') this.state.shape = value
            return
        }
        super.setStateValue(key, value)
    }

    syncWithThree(): void {
        if (this.stopHandles.length > 0) return

        this.stopHandles.push(watchSceneEffect(this, () => {
            const parent = this.nearestAncestorObject()
            if (this.root.parent !== parent) parent.add(this.root)
            this.root.name = `el-${this.id}`
            this.root.userData.el = this.element
            this.root.position.copy(this.element.getPosition())
            this.applyObjectState(this.root)
            this.stage.invalidateContentBounds?.()
        }))

        this.stopHandles.push(watchScene(this, () => [
            this.state.shape,
            this.state.width,
            this.state.height,
            this.state.radius,
            this.state.arc,
            this.state.thickness,
            this.state.bezel,
            this.state.segments,
            this.state.frameColor,
            this.state.textureWidth,
            this.state.textureHeight,
        ].join('|'), () => {
            const geometry: DisplayWallGeometryConfig = {
                shape: this.state.shape,
                width: this.state.width,
                height: this.state.height,
                radius: this.state.radius,
                arc: this.state.arc,
                thickness: this.state.thickness,
                bezel: this.state.bezel,
                segments: this.state.segments,
                frameColor: this.state.frameColor,
                textureWidth: this.state.textureWidth,
                textureHeight: this.state.textureHeight,
            }
            this.rebuild(geometry)
            this.stage.invalidateContentBounds?.()
        }, { immediate: true }))

        this.stopHandles.push(watchSceneEffect(this, () => {
            // Read the surface even while a structural rebuild is between screens,
            // so Vue keeps this effect subscribed to later surface changes.
            const surface = this.state.surface ?? {}
            if (this.screen) this.paintScreen(this.screen, surface)
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

        this.buildWall(config, frameMaterial)
        if (this.screen) this.paintScreen(this.screen, this.state.surface ?? {})
    }

    private buildWall(
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
            const sides = new Mesh(
                createDisplayWallEndCaps(radius, radius + thickness, height, arc),
                frameMaterial,
            )
            sides.name = `el-${this.id}-sides`
            sides.userData.el = this.element
            this.root.add(frame, outer, sides)

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
        mesh.name = `el-${this.id}-screen`
        mesh.userData.el = this.element
        mesh.renderOrder = 2
        const record = { canvas, context, texture, mesh, loadToken: 0 }
        this.screen = record
        return record
    }

    private paintScreen(screen: ScreenRecord, surface: VxDisplaySurface): void {
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
            index: 0,
            id: surface.id ?? 'display',
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
        if (this.screen) this.screen.loadToken += 1
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
        this.screen = undefined
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
