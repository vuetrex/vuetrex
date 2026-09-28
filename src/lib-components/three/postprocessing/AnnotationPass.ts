import * as THREE from 'three'
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js'

/**
 * Re-composites owned annotation contributions after image effects. The same
 * scene is rendered once with ordinary surfaces writing depth but no color and
 * annotations writing both, so labels remain occluded by world geometry.
 */
export class AnnotationPass extends Pass {
    private readonly copyMaterial = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
        vertexShader: CopyShader.vertexShader,
        fragmentShader: CopyShader.fragmentShader,
        depthTest: false,
        depthWrite: false,
    })
    private readonly quad = new FullScreenQuad(this.copyMaterial)
    private hiddenAnnotations?: THREE.Object3D[]

    constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.Camera) { super() }

    hideAnnotations(): () => void {
        const hidden: THREE.Object3D[] = []
        this.scene.traverse(object => {
            if (object.userData.vxBloomRole !== 'annotation' || !object.visible) return
            hidden.push(object)
            object.visible = false
        })
        this.hiddenAnnotations = hidden
        return () => {
            for (const object of hidden) object.visible = true
            this.hiddenAnnotations = undefined
        }
    }

    render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget,
        readBuffer: THREE.WebGLRenderTarget): void {
        this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
        this.quad.render(renderer)

        const annotations: THREE.Object3D[] = []
        const materialState = new Map<THREE.Material, boolean>()
        this.scene.traverse(object => {
            if (object.userData.vxBloomRole === 'annotation'
                && (this.hiddenAnnotations ? this.hiddenAnnotations.includes(object) : object.visible)) annotations.push(object)
            const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
            if (!material || object.userData.vxBloomRole === 'annotation') return
            for (const entry of Array.isArray(material) ? material : [material]) {
                if (!materialState.has(entry)) materialState.set(entry, entry.colorWrite)
                entry.colorWrite = false
            }
        })

        if (!annotations.length) {
            for (const [material, colorWrite] of materialState) material.colorWrite = colorWrite
            return
        }
        const visibility = annotations.map(object => object.visible)
        const autoClear = renderer.autoClear
        const background = this.scene.background
        try {
            // A Color background forces WebGLRenderer to clear even with autoClear=false.
            this.scene.background = null
            annotations.forEach(object => { object.visible = true })
            renderer.autoClear = false
            renderer.clearDepth()
            renderer.render(this.scene, this.camera)
        } finally {
            this.scene.background = background
            renderer.autoClear = autoClear
            annotations.forEach((object, index) => { object.visible = visibility[index] })
            for (const [material, colorWrite] of materialState) material.colorWrite = colorWrite
        }
    }

    dispose(): void { this.copyMaterial.dispose(); this.quad.dispose() }
}
