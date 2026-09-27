import { ExtrudeGeometry, Mesh, Shape } from 'three'
import { MeshNode, type MeshNodeStage } from '@/lib-components'

/** A fixed presentation base; MeshNode owns replacement and disposal. */
export class Plinth extends MeshNode {
  protected override readonly supportsDepth = true
  constructor(stage: MeshNodeStage) { super(stage) }

  modelGen() {
    const depth = this.state.depth
    return (height: number, size: number) => {
      const width = size * this.getScale()
      const length = (depth || size) * this.getScale()
      const bevel = Math.min(0.035, height / 4)
      const x = width / 2 - bevel, z = length / 2 - bevel
      const r = Math.min(0.9, x, z)
      const shape = new Shape()
      shape.moveTo(-x + r, -z)
      shape.lineTo(x - r, -z)
      shape.quadraticCurveTo(x, -z, x, -z + r)
      shape.lineTo(x, z - r)
      shape.quadraticCurveTo(x, z, x - r, z)
      shape.lineTo(-x + r, z)
      shape.quadraticCurveTo(-x, z, -x, z - r)
      shape.lineTo(-x, -z + r)
      shape.quadraticCurveTo(-x, -z, -x + r, -z)
      const geometry = new ExtrudeGeometry(shape, {
        depth: height - 2 * bevel, bevelEnabled: true,
        bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 16, steps: 1,
      })
      geometry.rotateX(-Math.PI / 2)
      geometry.center()
      const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv')
      for (let i = 0; i < position.count; i++) {
        uv.setXY(i, position.getX(i) / width + 0.5, position.getZ(i) / length + 0.5)
      }
      const mesh = new Mesh(geometry, this.material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      return mesh
    }
  }
}
