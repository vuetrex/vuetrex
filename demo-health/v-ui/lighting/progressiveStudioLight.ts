import * as THREE from 'three'
import { ProgressiveLightMap } from 'three/addons/misc/ProgressiveLightMap.js'
import type { VuetrexStage } from '@/lib-components/index.js'
import {
  PLATFORM_DEPTH_SCALE,
  PLATFORM_RADIUS,
  WALL_ARC_DEGREES,
  WALL_THICKNESS,
} from '../sceneGeometry.js'
import type { ThemeMode } from '../types.js'
import { SELECTED_POD_LIGHT_NAME } from './selectedPodLight.js'

interface ProgressiveStudioLightOptions {
  theme: ThemeMode
  onProgress?: (progress: number) => void
}

interface MeshSnapshot {
  mesh: LightMapMesh
  material: LightMapMaterial
  lightMap: THREE.Texture | null
  lightMapIntensity: number
  dithering: boolean
  castShadow: boolean
  receiveShadow: boolean
  renderOrder: number
  uv1?: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
  emissive?: number
  emissiveIntensity?: number
}

interface AtlasRect {
  x: number
  y: number
  width: number
  height: number
}

interface WallContactShadow {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  finalOpacity: number
  dispose(): void
}

type LightMapMaterial = THREE.Material & {
  lightMap: THREE.Texture | null
  lightMapIntensity: number
  dithering: boolean
  emissive?: THREE.Color
  emissiveIntensity?: number
}

type LightMapMesh = (THREE.Mesh | THREE.InstancedMesh) & {
  material: LightMapMaterial
}

export interface ProgressiveStudioLight {
  dispose(): void
}

const BAKE_STEPS = 49
const LIGHTS_PER_STEP = 2
const AMBIENT_INTERVAL = 9
const AMBIENT_SLOTS = 2
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const KEY_LIGHT_STRENGTH = 1.45
const SOFTBOX_ANGLE_DEGREES = 5.5
const BAKE_PROGRESS_SHARE = 0.8
const STUDIO_LIGHT_FADE_MS = 1000

/**
 * Demo-only progressive lightmap. Authored meshes and the curved wall cast
 * during the bake, while a few broad horizontal surfaces keep the result.
 * This keeps the prototype useful without production lightmap UVs everywhere.
 */
export function startProgressiveStudioLight(
  stage: VuetrexStage,
  options: ProgressiveStudioLightOptions,
): ProgressiveStudioLight | undefined {
  const scene = stage.getScene()
  const floor = (
    scene.getObjectByName('vx-floor-surface')
    ?? scene.getObjectByName('vx-ground-reflector')
  ) as THREE.Mesh | undefined
  if (!floor || !isLightMapMesh(floor)) return undefined

  const casters = collectCasters(scene)
  if (casters.length === 0) return undefined

  const renderer = stage.renderer
  const camera = stage.camera
  const originalBackground = scene.background
  const meshes = [...casters, floor]
  const snapshots = meshes.map(snapshotMesh)
  const sceneLights = collectSceneLights(scene)
  const lightSnapshots = sceneLights.map(light => ({
    light,
    intensity: light.intensity,
    castShadow: light.castShadow,
  }))
  const originalShadowType = renderer.shadowMap.type
  const originalShadowEnabled = renderer.shadowMap.enabled
  const originalToneMappingExposure = renderer.toneMappingExposure
  const originalBackgroundColor = originalBackground instanceof THREE.Color
    ? originalBackground.clone()
    : undefined
  const sceneFog = scene.fog instanceof THREE.Fog ? scene.fog : undefined
  const originalFogColor = sceneFog?.color.clone()
  const finalLiveLightScale = (options.theme === 'light' ? 0.36 : 0.28) * KEY_LIGHT_STRENGTH
  const finalToneMappingExposure = options.theme === 'light' ? 1.06 : originalToneMappingExposure
  const finalBackgroundColor = options.theme === 'light'
    ? new THREE.Color(0xf4f7f8)
    : undefined
  const finalFogColor = finalBackgroundColor?.clone()

  // Keep the live scene untouched while the offscreen bake runs. The finished
  // contribution is introduced only after every sample is available.
  const wallMaterialTransitions = new Map<LightMapMaterial, {
    startColor: THREE.Color
    finalColor: THREE.Color
    startIntensity: number
    finalIntensity: number
  }>()
  for (const caster of casters) {
    if (!belongsToHealthWall(caster) || !caster.material.emissive
      || wallMaterialTransitions.has(caster.material)) continue
    wallMaterialTransitions.set(caster.material, {
      startColor: caster.material.emissive.clone(),
      finalColor: new THREE.Color(options.theme === 'light' ? 0x5f5f5b : 0x101719),
      startIntensity: caster.material.emissiveIntensity ?? 1,
      finalIntensity: options.theme === 'light' ? 0.28 : 0.12,
    })
  }

  const bounds = casterBounds(casters)
  const center = bounds.getCenter(new THREE.Vector3())
  center.y = Math.max(center.y * 0.35, 0.35)
  const sphere = bounds.getBoundingSphere(new THREE.Sphere())
  const lightDistance = Math.max(18, sphere.radius * 5)
  const shadowExtent = Math.max(7, sphere.radius * 1.18)
  const lightMap = new ProgressiveLightMap(renderer, 1024)
  const target = new THREE.Object3D()
  target.position.copy(center)
  scene.add(target)
  scene.updateMatrixWorld(true)
  floor.attach(target)

  const bakeLights = Array.from({ length: LIGHTS_PER_STEP }, (_, index) => {
    const light = new THREE.DirectionalLight(
      options.theme === 'light' ? 0xfff5e8 : 0xdceeff,
      Math.PI * KEY_LIGHT_STRENGTH / LIGHTS_PER_STEP,
    )
    light.name = `vx-progressive-studio-light-${index}`
    light.target = target
    light.castShadow = true
    light.shadow.camera = new THREE.OrthographicCamera(
      -shadowExtent,
      shadowExtent,
      shadowExtent,
      -shadowExtent,
      0.1,
      lightDistance * 2.5,
    )
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = 0.0006
    light.shadow.normalBias = 0.025
    return light
  })

  // The addon gives every object an equal atlas cell. Replace that temporary
  // packing for the useful receivers so the floor, platform, and panel tops
  // get predictable texture density while the other shapes remain cast-only.
  lightMap.addObjectsToLightMap([...casters, floor, ...bakeLights])
  const receivers = configureReceivers(floor, casters, options.theme)
  const receiverIntensities = new Map(
    [...receivers].map(mesh => [mesh, mesh.material.lightMapIntensity] as const),
  )
  floor.castShadow = false

  for (const caster of casters) {
    if (!receivers.has(caster)) {
      caster.material.lightMapIntensity = 0
      collapseLightMapUv(caster)
    }
  }
  // The add-on attaches its render target immediately. Hold every lightmap at
  // zero while it is incomplete, including the global floor helper.
  for (const snapshot of snapshots) snapshot.material.lightMapIntensity = 0
  restoreLiveMeshState(snapshots)

  let disposed = false
  let frame: number | undefined
  let fillLight: THREE.HemisphereLight | undefined
  let wallContactShadow: WallContactShadow | undefined
  let blendedBackground: THREE.Color | undefined
  let step = 0

  const update = () => {
    if (disposed) return

    for (let index = 0; index < bakeLights.length; index++) {
      const sampleIndex = step * bakeLights.length + index
      positionBakeLight(
        bakeLights[index],
        sampleIndex,
        BAKE_STEPS * bakeLights.length,
        center,
        lightDistance,
      )
      const ambient = sampleIndex % AMBIENT_INTERVAL < AMBIENT_SLOTS
      bakeLights[index].color.setHex(ambient
        ? options.theme === 'light' ? 0xdcecff : 0x9fc5df
        : options.theme === 'light' ? 0xfff5e8 : 0xdceeff)
    }

    // Keep bake-only renderer and mesh flags contained inside this synchronous
    // offscreen pass so the live scene cannot flash into a partial state.
    prepareBakeState(snapshots, floor)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.BasicShadowMap
    // A growing averaging window is a finite running average. Unlike the
    // example's fixed blend window, the first result does not retain the
    // render target's cleared colour.
    try {
      lightMap.update(camera, step + 1, true)
    } finally {
      restoreLiveMeshState(snapshots)
      renderer.shadowMap.type = originalShadowType
      renderer.shadowMap.enabled = originalShadowEnabled
    }
    step += 1
    options.onProgress?.(step / BAKE_STEPS * BAKE_PROGRESS_SHARE)

    if (step < BAKE_STEPS) {
      frame = requestAnimationFrame(update)
      return
    }

    finish()
  }

  const finish = () => {
    target.removeFromParent()
    restoreTemporaryCasterState(snapshots, receivers)
    renderer.shadowMap.type = originalShadowType
    renderer.shadowMap.enabled = originalShadowEnabled
    const finalFillIntensity = options.theme === 'light' ? 0.48 : 0.22
    fillLight = new THREE.HemisphereLight(
      options.theme === 'light' ? 0xfffbf5 : 0xb9d7e6,
      options.theme === 'light' ? 0xcbd4dc : 0x121719,
      0,
    )
    fillLight.name = 'vx-progressive-studio-fill'
    scene.add(fillLight)
    wallContactShadow = createWallContactShadow(options.theme)
    scene.add(wallContactShadow.mesh)

    if (finalBackgroundColor && originalBackgroundColor) {
      blendedBackground = originalBackgroundColor.clone()
      scene.background = blendedBackground
    }

    let fadeStart: number | undefined
    const fadeIn = (timestamp: number) => {
      if (disposed) return
      fadeStart ??= timestamp
      const progress = THREE.MathUtils.clamp(
        (timestamp - fadeStart) / STUDIO_LIGHT_FADE_MS,
        0,
        1,
      )
      const eased = easeStudioLight(progress)

      receiverIntensities.forEach((intensity, mesh) => {
        mesh.material.lightMapIntensity = intensity * eased
      })
      lightSnapshots.forEach(({ light, intensity }) => {
        light.intensity = THREE.MathUtils.lerp(intensity, intensity * finalLiveLightScale, eased)
      })
      fillLight!.intensity = finalFillIntensity * eased
      wallContactShadow!.material.opacity = wallContactShadow!.finalOpacity * eased
      renderer.toneMappingExposure = THREE.MathUtils.lerp(
        originalToneMappingExposure,
        finalToneMappingExposure,
        eased,
      )
      wallMaterialTransitions.forEach((transition, material) => {
        material.emissive!.copy(transition.startColor).lerp(transition.finalColor, eased)
        material.emissiveIntensity = THREE.MathUtils.lerp(
          transition.startIntensity,
          transition.finalIntensity,
          eased,
        )
      })
      if (blendedBackground && finalBackgroundColor) {
        blendedBackground.copy(originalBackgroundColor!).lerp(finalBackgroundColor, eased)
      }
      if (sceneFog && originalFogColor && finalFogColor) {
        sceneFog.color.copy(originalFogColor).lerp(finalFogColor, eased)
      }

      options.onProgress?.(BAKE_PROGRESS_SHARE + (1 - BAKE_PROGRESS_SHARE) * progress)
      if (progress < 1) {
        frame = requestAnimationFrame(fadeIn)
        return
      }

      if (finalBackgroundColor && !blendedBackground) scene.background = finalBackgroundColor
      sceneLights.forEach(light => { light.castShadow = false })
      renderer.shadowMap.enabled = false
      frame = undefined
      options.onProgress?.(1)
    }

    frame = requestAnimationFrame(fadeIn)
  }

  frame = requestAnimationFrame(update)

  return {
    dispose() {
      if (disposed) return
      disposed = true
      if (frame !== undefined) cancelAnimationFrame(frame)
      target.removeFromParent()
      fillLight?.removeFromParent()
      wallContactShadow?.dispose()
      restoreAllMeshState(snapshots)
      lightSnapshots.forEach(({ light, intensity, castShadow }) => {
        light.intensity = intensity
        light.castShadow = castShadow
      })
      renderer.shadowMap.type = originalShadowType
      renderer.shadowMap.enabled = originalShadowEnabled
      renderer.toneMappingExposure = originalToneMappingExposure
      scene.background = originalBackground
      if (sceneFog && originalFogColor) sceneFog.color.copy(originalFogColor)
      lightMap.dispose()
      options.onProgress?.(0)
    },
  }
}

function collectCasters(scene: THREE.Scene): LightMapMesh[] {
  const casters: LightMapMesh[] = []
  scene.traverse(object => {
    if (!isLightMapMesh(object) || !object.visible) return
    if (!object.name.startsWith('el-') && !belongsToHealthWall(object)) return
    if (object.name.endsWith('-screen')) return
    if (!object.geometry.hasAttribute('uv') || !object.geometry.hasAttribute('normal')) return
    casters.push(object)
  })
  return casters
}

function belongsToHealthWall(object: THREE.Object3D) {
  let ancestor = object.parent
  while (ancestor) {
    if (
      ancestor.name === 'el-health-wall'
    ) return true
    ancestor = ancestor.parent
  }
  return false
}

function collectSceneLights(scene: THREE.Scene): THREE.Light[] {
  const lights: THREE.Light[] = []
  scene.traverse(object => {
    if (object instanceof THREE.Light && object.name !== SELECTED_POD_LIGHT_NAME) lights.push(object)
  })
  return lights
}

function casterBounds(casters: LightMapMesh[]): THREE.Box3 {
  const bounds = new THREE.Box3()
  for (const caster of casters) bounds.expandByObject(caster, true)
  return bounds
}

function snapshotMesh(mesh: LightMapMesh): MeshSnapshot {
  return {
    mesh,
    material: mesh.material,
    lightMap: mesh.material.lightMap,
    lightMapIntensity: mesh.material.lightMapIntensity,
    dithering: mesh.material.dithering,
    castShadow: mesh.castShadow,
    receiveShadow: mesh.receiveShadow,
    renderOrder: mesh.renderOrder,
    uv1: mesh.geometry.getAttribute('uv1'),
    emissive: mesh.material.emissive?.getHex(),
    emissiveIntensity: mesh.material.emissiveIntensity,
  }
}

function prepareBakeState(snapshots: MeshSnapshot[], floor: LightMapMesh) {
  snapshots.forEach((snapshot, index) => {
    snapshot.mesh.castShadow = snapshot.mesh !== floor
    snapshot.mesh.receiveShadow = true
    snapshot.mesh.renderOrder = 1000 + index
  })
}

function restoreLiveMeshState(snapshots: MeshSnapshot[]) {
  for (const snapshot of snapshots) {
    snapshot.mesh.castShadow = snapshot.castShadow
    snapshot.mesh.receiveShadow = snapshot.receiveShadow
    snapshot.mesh.renderOrder = snapshot.renderOrder
  }
}

function restoreTemporaryCasterState(
  snapshots: MeshSnapshot[],
  receivers: Set<LightMapMesh>,
) {
  for (const snapshot of snapshots) {
    if (!receivers.has(snapshot.mesh)) {
      snapshot.material.lightMap = snapshot.lightMap
      snapshot.material.lightMapIntensity = snapshot.lightMapIntensity
      restoreUv1(snapshot)
    }
    snapshot.material.dithering = snapshot.dithering
    snapshot.material.needsUpdate = true
    snapshot.mesh.castShadow = snapshot.castShadow
    snapshot.mesh.receiveShadow = snapshot.receiveShadow
    snapshot.mesh.renderOrder = snapshot.renderOrder
  }
}

function configureReceivers(
  floor: LightMapMesh,
  casters: LightMapMesh[],
  theme: ThemeMode,
): Set<LightMapMesh> {
  const platform = casters.find(mesh => mesh.name === 'el-stage-platform-surface')
  const panels = casters.filter(mesh =>
    mesh.name.endsWith('-surface') && mesh.name !== 'el-stage-platform-surface')
  const receivers = new Set<LightMapMesh>([
    ...(platform ? [platform] : []),
    ...panels,
  ])
  const intensity = theme === 'light' ? 0.9 : 1.05

  // The infinite grid floor would tint the whole backdrop with the lightmap.
  // Keep it live-lit and spend the atlas on the presentation platform instead.
  collapseLightMapUv(floor)

  if (platform) {
    applyTopProjectionToRect(platform, { x: 0, y: 0, width: 0.72, height: 1 })
    platform.material.lightMapIntensity = intensity
    platform.castShadow = false
    platform.renderOrder = 2001
  }

  panels.forEach((panel, index) => {
    const columns = 3
    const column = index % columns
    const row = Math.floor(index / columns)
    applyTopProjectionToRect(panel, {
      x: 0.72 + column * (0.28 / columns),
      y: row * 0.5,
      width: 0.28 / columns,
      height: 0.5,
    })
    panel.material.lightMapIntensity = intensity
    panel.renderOrder = 2010 + index
  })

  return receivers
}

function collapseLightMapUv(mesh: LightMapMesh) {
  const position = mesh.geometry.getAttribute('position')
  const uv1 = new THREE.Float32BufferAttribute(position.count * 2, 2)
  mesh.geometry.setAttribute('uv1', uv1)
  uv1.needsUpdate = true
}

/**
 * A tiny load-time shadow catcher reinforces contact at the wall footprint.
 * The progressive map still supplies the scene shadows; this fixed gradient
 * gives the large architectural anchor the stylised ambient occlusion visible
 * in product-illustration lighting.
 */
function createWallContactShadow(theme: ThemeMode): WallContactShadow {
  const segments = 96
  const innerRadius = PLATFORM_RADIUS - 1.75
  const outerRadius = PLATFORM_RADIUS + WALL_THICKNESS
  const arc = THREE.MathUtils.degToRad(WALL_ARC_DEGREES)
  const start = Math.PI - arc / 2
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let index = 0; index <= segments; index++) {
    const progress = index / segments
    const angle = start + progress * arc
    for (const [radius, radial] of [[innerRadius, 0], [outerRadius, 1]] as const) {
      positions.push(
        Math.sin(angle) * radius,
        0.006,
        Math.cos(angle) * radius * PLATFORM_DEPTH_SCALE,
      )
      uvs.push(radial, progress)
    }
    if (index === segments) continue
    const offset = index * 2
    indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 32
  const context = canvas.getContext('2d')!
  const pixels = context.createImageData(canvas.width, canvas.height)
  for (let y = 0; y < canvas.height; y++) {
    const along = y / (canvas.height - 1)
    const endFade = Math.min(1, along / 0.08, (1 - along) / 0.08)
    for (let x = 0; x < canvas.width; x++) {
      const radial = x / (canvas.width - 1)
      const density = Math.round(255 * Math.pow(radial, 3.2) * endFade)
      const pixel = (y * canvas.width + x) * 4
      pixels.data[pixel] = density
      pixels.data[pixel + 1] = density
      pixels.data[pixel + 2] = density
      pixels.data[pixel + 3] = 255
    }
  }
  context.putImageData(pixels, 0, 0)

  const alphaMap = new THREE.CanvasTexture(canvas)
  const finalOpacity = theme === 'light' ? 0.34 : 0.36
  const material = new THREE.MeshBasicMaterial({
    color: theme === 'light' ? 0x6f7c87 : 0x050708,
    alphaMap,
    opacity: 0,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'vx-progressive-wall-contact-shadow'
  mesh.renderOrder = 2005

  return {
    mesh,
    material,
    finalOpacity,
    dispose() {
      mesh.removeFromParent()
      geometry.dispose()
      material.dispose()
      alphaMap.dispose()
    },
  }
}

function applyTopProjectionToRect(
  mesh: LightMapMesh,
  rect: AtlasRect,
) {
  const position = mesh.geometry.getAttribute('position')
  const normal = mesh.geometry.getAttribute('normal')
  mesh.geometry.computeBoundingBox()
  const bounds = mesh.geometry.boundingBox!
  const width = Math.max(Number.EPSILON, bounds.max.x - bounds.min.x)
  const depth = Math.max(Number.EPSILON, bounds.max.z - bounds.min.z)
  const inset = 3 / 1024
  const usableWidth = rect.width - inset * 2
  const usableHeight = rect.height - inset * 2
  const uv1 = new THREE.Float32BufferAttribute(position.count * 2, 2)

  for (let index = 0; index < position.count; index++) {
    if (normal.getY(index) <= 0.02) {
      // Collapse underside and vertical faces so they cannot overwrite the
      // useful top projection while the mesh is rendered in UV space.
      uv1.setXY(index, rect.x + inset, rect.y + inset)
      continue
    }
    uv1.setXY(
      index,
      rect.x + inset + ((position.getX(index) - bounds.min.x) / width) * usableWidth,
      rect.y + inset + ((bounds.max.z - position.getZ(index)) / depth) * usableHeight,
    )
  }

  mesh.geometry.setAttribute('uv1', uv1)
  uv1.needsUpdate = true
}

function restoreAllMeshState(snapshots: MeshSnapshot[]) {
  for (const snapshot of snapshots) {
    snapshot.material.lightMap = snapshot.lightMap
    snapshot.material.lightMapIntensity = snapshot.lightMapIntensity
    snapshot.material.dithering = snapshot.dithering
    snapshot.material.needsUpdate = true
    snapshot.mesh.castShadow = snapshot.castShadow
    snapshot.mesh.receiveShadow = snapshot.receiveShadow
    snapshot.mesh.renderOrder = snapshot.renderOrder
    if (snapshot.emissive !== undefined && snapshot.material.emissive) {
      snapshot.material.emissive.setHex(snapshot.emissive)
    }
    if (snapshot.emissiveIntensity !== undefined) {
      snapshot.material.emissiveIntensity = snapshot.emissiveIntensity
    }
    restoreUv1(snapshot)
  }
}

function restoreUv1(snapshot: MeshSnapshot) {
  if (snapshot.uv1) snapshot.mesh.geometry.setAttribute('uv1', snapshot.uv1)
  else snapshot.mesh.geometry.deleteAttribute('uv1')
}

function isLightMapMesh(object: THREE.Object3D): object is LightMapMesh {
  const mesh = object as THREE.Mesh
  if (!(mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh)) return false
  if (Array.isArray(mesh.material) || !mesh.material) return false
  return 'lightMap' in mesh.material && 'lightMapIntensity' in mesh.material
}

function positionBakeLight(
  light: THREE.DirectionalLight,
  sampleIndex: number,
  sampleCount: number,
  center: THREE.Vector3,
  distance: number,
) {
  const ambient = sampleIndex % AMBIENT_INTERVAL < AMBIENT_SLOTS
  if (ambient) {
    const progress = (sampleIndex + 0.5) / sampleCount
    const y = Math.sqrt(1 - progress)
    const radius = Math.sqrt(progress)
    const angle = sampleIndex * GOLDEN_ANGLE
    light.position.copy(center).add(new THREE.Vector3(
      Math.cos(angle) * radius,
      y,
      Math.sin(angle) * radius,
    ).multiplyScalar(distance))
    return
  }

  // Put the virtual softbox just behind the wall. Its broad shadow therefore
  // falls into the stage instead of disappearing behind the presentation.
  const direction = new THREE.Vector3(-0.34, 1.5, -0.58).normalize()
  const tangent = new THREE.Vector3().crossVectors(direction, THREE.Object3D.DEFAULT_UP).normalize()
  const bitangent = new THREE.Vector3().crossVectors(direction, tangent).normalize()
  const radius = Math.sqrt((sampleIndex + 0.5) / sampleCount)
  const angle = sampleIndex * GOLDEN_ANGLE
  const angularRadius = Math.tan(THREE.MathUtils.degToRad(SOFTBOX_ANGLE_DEGREES)) * distance
  light.position.copy(center)
    .addScaledVector(direction, distance)
    .addScaledVector(tangent, Math.cos(angle) * radius * angularRadius)
    .addScaledVector(bitangent, Math.sin(angle) * radius * angularRadius)
}

function easeStudioLight(progress: number): number {
  return progress * progress * (3 - 2 * progress)
}
