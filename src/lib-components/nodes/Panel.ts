import { resolveMaterialBinding, type VxMaterialBinding } from '../styling/stylesheets.js'
import { reactive, watchEffect, type WatchStopHandle } from 'vue'
import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { Text } from 'troika-three-text'
import * as THREEx from '@/lib-components/three/three.imports.js'
import { Node } from '@/lib-components/nodes/Node.js'
import {
    depthLayout,
    gridLayout,
    horizontalLayout,
    type Layout,
    ringLayout,
    stackLayout,
} from '@/lib-components/nodes/layouts.js'
import type { VxHoverProps, VxMaterialProps } from '@/lib-components/styling/types.js'
import { MaterialController } from '@/lib-components/styling/MaterialController.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

type PanelLayout = 'grid' | 'row' | 'depth' | 'stack' | 'ring'
type PanelRegion = 'north' | 'south'

interface PanelState {
    text: string
    size: number
    depth: number
    height: number
    lines: string[]
    labelRegion: PanelRegion
    labelShare: number
    labelPadding: number
    labelColor: number
    labelFontSize: number
    labelLineHeight: number
    labelAlign: 'left' | 'center' | 'right'
    contentPadding: number
    layout: PanelLayout
    gap?: number
    startAngle: number
    direction: 'normal' | 'reverse'
    material?: VxMaterialBinding
    hover?: VxHoverProps
}

/**
 * A visual rounded-box container whose top face is divided into a content
 * region and a label region. Children live in a local Group on the top face;
 * the label is independent SDF text, so neither reserves layout space for the
 * other.
 */
export class Panel extends Node {
    public readonly type = 'Panel'
    public readonly isGroupNode = true

    /** Children are parented here by Node.nearestAncestorObject(). */
    readonly group = new Group()

    /** Backing geometry and label share this root with the child group. */
    private readonly rootGroup = new Group()
    private readonly material: MeshStandardMaterial
    private readonly backingMesh: Mesh
    private labelMesh?: any
    private stopHandles: WatchStopHandle[] = []
    private readonly materialController: MaterialController
    private removed = false

    declare protected state: PanelState

    constructor(stage: VuetrexStage) {
        super(stage)
        this.state = reactive({
            text: '',
            size: 1,
            depth: 0,
            height: 0.22,
            lines: [],
            labelRegion: 'south',
            labelShare: 0.4,
            labelPadding: 0.1,
            labelColor: 0xffffff,
            labelFontSize: 0,
            labelLineHeight: 1.15,
            labelAlign: 'center',
            contentPadding: 0.08,
            layout: 'grid',
            gap: undefined,
            startAngle: 0,
            direction: 'normal',
            material: undefined,
            hover: undefined,
        }) as PanelState

        this.material = stage.createElementMaterial()
        this.materialController = new MaterialController(this.material)
        this.materialController.setTarget(this.rootGroup)
        this.backingMesh = new Mesh(new THREEx.RoundedBoxGeometry(1, 1, 1, 5, 0.05), this.material)
        this.backingMesh.castShadow = stage.shadowsEnabled?.() ?? true
        this.backingMesh.receiveShadow = stage.shadowsEnabled?.() ?? true
        this.rootGroup.add(this.backingMesh)
        this.rootGroup.add(this.group)
        this.element.mesh = this.rootGroup as any
    }

    private width(): number {
        return Math.max(0.001, this.state.size)
    }

    private depth(): number {
        return Math.max(0.001, this.state.depth > 0 ? this.state.depth : this.state.size)
    }

    private height(): number {
        return Math.max(0.001, this.state.height)
    }

    private share(): number {
        return Math.max(0.1, Math.min(0.9, this.state.labelShare))
    }

    private currentLayout(): Layout {
        if (this.state.layout === 'row') return horizontalLayout
        if (this.state.layout === 'depth') return depthLayout
        if (this.state.layout === 'stack') return stackLayout
        if (this.state.layout === 'ring') {
            return ringLayout.withOptions({
                startAngle: this.state.startAngle,
                direction: this.state.direction,
            })
        }
        return gridLayout
    }

    private gap(): number {
        return typeof this.state.gap === 'number' ? this.state.gap : this.stage.boxDistance
    }

    private childFootprints(): Vector3[] {
        return (this.elements.value as Node[]).map(child => child.measuredSize.value)
    }

    private contentSize(): Vector3 {
        return this.currentLayout().measure(this.childFootprints(), this.gap())
    }

    private contentScale(): number {
        const content = this.contentSize()
        if (content.x <= 0 || content.z <= 0) return 1
        const padding = Math.max(0, Math.min(0.4, this.state.contentPadding))
        const availableWidth = this.width() * (1 - 2 * padding)
        const availableDepth = this.depth() * (1 - this.share()) * (1 - 2 * padding)
        return Math.min(1, availableWidth / content.x, availableDepth / content.z)
    }

    private contentCenterZ(): number {
        const offset = this.share() * this.depth() / 2
        return this.state.labelRegion === 'north' ? offset : -offset
    }

    private labelCenterZ(): number {
        const offset = this.depth() * (0.5 - this.share() / 2)
        return this.state.labelRegion === 'north' ? -offset : offset
    }

    protected override intrinsicSize(): Vector3 {
        const content = this.contentSize()
        return new Vector3(
            this.width(),
            this.height() + content.y * this.contentScale(),
            this.depth(),
        )
    }

    override renderOffset(): Vector3 {
        return new Vector3(0, this.height() / 2, 0)
    }

    layoutPositionOf(child: Node): Vector3 {
        if (!child.participatesInLayout()) return super.layoutPositionOf(child)
        const children = this.elements.value as Node[]
        const index = Math.max(0, children.indexOf(child))
        const position = this.currentLayout().place(index, this.childFootprints(), this.gap())
        position.y += child.getElevation()
        return position
    }

    override setStateValue(key: string, value: any): void {
        if (key === 'labelRegion' || key === 'label-region') {
            if (value === 'north' || value === 'south') this.state.labelRegion = value
            return
        }
        if (key === 'layout') {
            if (value === 'grid' || value === 'row' || value === 'depth' || value === 'stack' || value === 'ring') {
                this.state.layout = value
            }
            return
        }
        super.setStateValue(key, value)
    }

    syncWithThree(): void {
        if (this.stopHandles.length > 0 || this.removed) return

        this.subscribeEvents()

        this.stopHandles.push(watchEffect(() => {
            const position = this.element.getPosition()
            const parentObject = this.nearestAncestorObject()
            if (this.rootGroup.parent !== parentObject) parentObject.add(this.rootGroup)
            this.rootGroup.name = `el-${this.id}`
            this.rootGroup.userData.el = this.element
            this.rootGroup.position.copy(position)
            this.backingMesh.name = `el-${this.id}-surface`
            this.backingMesh.userData.el = this.element
            this.applyObjectState(this.rootGroup)
            this.stage.connectors.update(this.element)
            this.stage.invalidateContentBounds?.()
        }))

        this.stopHandles.push(watchEffect(() => {
            const width = this.width()
            const depth = this.depth()
            const height = this.height()
            const oldGeometry = this.backingMesh.geometry
            this.backingMesh.geometry = new THREEx.RoundedBoxGeometry(width, height, depth, 5, Math.min(0.05, height / 3))
            oldGeometry.dispose()
            this.stage.invalidateContentBounds?.()
        }))

        this.stopHandles.push(watchEffect(() => {
            const scale = this.contentScale()
            this.group.position.set(0, this.height() / 2, this.contentCenterZ())
            this.group.scale.setScalar(scale)
            this.stage.connectors.update(this.element)
            this.stage.invalidateContentBounds?.()
        }))

        this.stopHandles.push(watchEffect(() => {
            const binding = resolveMaterialBinding(this.stage.materialStyles?.value, this.state.material, this.state.hover)
            this.materialController.update(binding.layers, binding.hover)
        }))

        this.stopHandles.push(watchEffect(() => this.updateLabel()))
        this.stage.reconcileConnections()
    }

    private updateLabel(): void {
        const {
            lines,
            labelColor,
            labelFontSize,
            labelLineHeight,
            labelAlign,
        } = this.state
        const width = this.width()
        const height = this.height()
        const padding = Math.max(0, Math.min(0.45, this.state.labelPadding))
        const regionDepth = this.depth() * this.share()
        if (!lines || lines.length === 0) {
            this.disposeLabel()
            return
        }

        if (!this.labelMesh) {
            this.labelMesh = new Text()
            this.labelMesh.anchorY = 'middle'
            this.rootGroup.add(this.labelMesh)
        }

        const lineHeight = labelLineHeight > 0 ? labelLineHeight : 1.15
        const availableWidth = width * (1 - 2 * padding)
        const availableDepth = regionDepth * (1 - 2 * padding)
        const fontSize = labelFontSize > 0
            ? labelFontSize
            : Math.min(availableWidth / 6, availableDepth / (lineHeight * Math.max(1, lines.length)))
        const align = labelAlign === 'left' || labelAlign === 'right' ? labelAlign : 'center'
        const x = align === 'left' ? -(width / 2 - width * padding)
            : align === 'right' ? width / 2 - width * padding
            : 0

        this.labelMesh.position.set(x, height / 2 + 0.001, this.labelCenterZ())
        this.labelMesh.rotation.set(-Math.PI / 2, 0, 0)
        this.labelMesh.anchorX = align
        this.labelMesh.textAlign = align
        this.labelMesh.maxWidth = availableWidth
        this.labelMesh.fontSize = fontSize
        this.labelMesh.lineHeight = lineHeight
        this.labelMesh.text = lines.join('\n')
        this.labelMesh.color = labelColor
        this.labelMesh.sync()
    }

    private disposeLabel(): void {
        if (!this.labelMesh) return
        this.labelMesh.removeFromParent()
        this.labelMesh.dispose()
        this.labelMesh = undefined
    }

    override dispatchPointerenter(event: MouseEvent): void {
        this.materialController.setHovered(true)
        super.dispatchPointerenter(event)
    }

    override dispatchPointerleave(event: MouseEvent): void {
        this.materialController.setHovered(false)
        super.dispatchPointerleave(event)
    }

    onRemoved(): void {
        if (this.removed) return
        this.removed = true
        this.stopHandles.forEach(stop => stop())
        this.stopHandles = []
        this.stage.connectors.remove(this.element)
        this.disposeLabel()
        this.backingMesh.geometry.dispose()
        this.materialController.dispose()
        this.rootGroup.removeFromParent()
        this.rootGroup.clear()
        this.stage.invalidateContentBounds?.()
    }
}
