import * as THREE from 'three'
import { GeometryNode, InstanceNode, type VuetrexStage } from '@/lib-components/index.js'
import type { ThemeMode } from '../types.js'

interface SelectedPodLightOptions {
  theme: ThemeMode
}

export interface SelectedPodLight {
  setTarget(deploymentId?: string, podId?: string, active?: boolean): void
  dispose(): void
}

export const SELECTED_POD_LIGHT_NAME = 'vx-selected-pod-light'

const LIGHT_HEIGHT = 1.75
const LIGHT_REACH = 2.0

const LIGHT_ANGLE = THREE.MathUtils.degToRad(35)
const LIGHT_PENUMBRA = 0.88
const FADE_IN_RESPONSE_MS = 65
const FADE_OUT_RESPONSE_MS = 85

/** A short-range live accent for the selected GPU instance. */
export function createSelectedPodLight(
  stage: VuetrexStage,
  options: SelectedPodLightOptions,
): SelectedPodLight {
  const scene = stage.getScene()
  const lightTarget = new THREE.Object3D()
  lightTarget.name = `${SELECTED_POD_LIGHT_NAME}-target`
  const light = new THREE.SpotLight(
    options.theme === 'light' ? 0x8ed8ff : 0x6ad9ff,
    0,
    LIGHT_REACH,
    LIGHT_ANGLE,
    LIGHT_PENUMBRA,
    2,
  )
  light.name = SELECTED_POD_LIGHT_NAME
  light.target = lightTarget
  light.castShadow = false
  light.visible = false
  scene.add(light, lightTarget)

  const bounds = new THREE.Box3()
  const center = new THREE.Vector3()
  let deploymentId: string | undefined
  let podId: string | undefined
  let active = false
  let intensity = 0
  let lastTime: number | undefined
  let disposed = false
  let frame: number | undefined
  const finalIntensity = options.theme === 'light' ? 650 : 450

  const update = (time: number) => {
    if (disposed) return

    let hasTarget = false
    if (active && deploymentId && podId) {
      const node = stage.getById(`${deploymentId}:pods`)?.node
      if ((node instanceof InstanceNode || node instanceof GeometryNode)
        && node.instanceWorldBounds(podId, bounds)) {
        bounds.getCenter(center)
        light.position.set(center.x, bounds.max.y + LIGHT_HEIGHT, center.z)
        lightTarget.position.set(center.x, 0, center.z)
        hasTarget = true
      }
    }

    const desiredIntensity = hasTarget ? finalIntensity : 0
    const elapsed = Math.min(50, Math.max(0, time - (lastTime ?? time)))
    const response = desiredIntensity > intensity ? FADE_IN_RESPONSE_MS : FADE_OUT_RESPONSE_MS
    const blend = 1 - Math.exp(-elapsed / response)
    intensity = THREE.MathUtils.lerp(intensity, desiredIntensity, blend)
    if (desiredIntensity === 0 && intensity < 0.002) intensity = 0
    light.intensity = intensity
    light.visible = intensity > 0
    lastTime = time
    frame = requestAnimationFrame(update)
  }

  frame = requestAnimationFrame(update)

  return {
    setTarget(nextDeploymentId, nextPodId, nextActive = true) {
      deploymentId = nextDeploymentId
      podId = nextPodId
      active = nextActive
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (frame !== undefined) cancelAnimationFrame(frame)
      light.removeFromParent()
      lightTarget.removeFromParent()
      light.dispose()
    },
  }
}
