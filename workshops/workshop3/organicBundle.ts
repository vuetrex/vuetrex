import { Quaternion, Vector3 } from 'three'
import { geo, type GeometrySource } from '@/lib-components/index.js'

type Vector3Tuple = readonly [number, number, number]

export interface OrganicBundleOptions {
  strands: number
  samples: number
  twistTurns: number
  growth: number
  seed: number
}

interface StrandResult {
  source: GeometrySource
  tip: Vector3Tuple
}

const UP = new Vector3(0, 1, 0)
const SIDE = new Vector3(1, 0, 0)

function mulberry32(seed: number) {
  //repeatable pseudo-random gen
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

// The guide is intentionally ordinary math rather than a special curve operator.
// Replacing this function is the easiest way to make an entirely different organism.
function guide(t: number, target = new Vector3()): Vector3 {
  const arch = Math.sin(Math.PI * t)
  //transition from vertical (0, 7.4*t, 0) to warping target via mixing (1-t)*f + t*g
  return target.set(
    t * (1.05 * Math.sin(t * Math.PI * 1.55) + 0.34 * Math.sin(t * Math.PI * 1.7)),
    7.4 * t,
    t*(-0.48 + 0.78 * Math.cos(t * Math.PI * 1.25) + 0.42 * arch * arch),
  )
}

function guideTangent(t: number, target = new Vector3()): Vector3 {
  const epsilon = 0.0005
  const before = guide(Math.max(0, t - epsilon), new Vector3())
  const after = guide(Math.min(1, t + epsilon), target)
  return after.sub(before).normalize()
}

function transportedFrames(count: number, growth: number) {
  const frames: Array<{ center: Vector3, tangent: Vector3, normal: Vector3, binormal: Vector3 }> = []
  let tangent = guideTangent(0)
  let normal = new Vector3().crossVectors(tangent, Math.abs(tangent.dot(UP)) > 0.92 ? SIDE : UP).normalize()
  let binormal = new Vector3().crossVectors(tangent, normal).normalize()

  for (let index = 0; index < count; index++) {
    const t = index / (count - 1) * growth
    const nextTangent = guideTangent(t)
    if (index > 0) {
      const axis = new Vector3().crossVectors(tangent, nextTangent)
      if (axis.lengthSq() > 1e-10) {
        axis.normalize()
        const rotation = new Quaternion().setFromAxisAngle(axis, Math.acos(Math.min(1, tangent.dot(nextTangent))))
        normal.applyQuaternion(rotation).normalize()
      }
      binormal.crossVectors(nextTangent, normal).normalize()
      normal.crossVectors(binormal, nextTangent).normalize()
    }
    tangent = nextTangent
    frames.push({ center: guide(t), tangent: tangent.clone(), normal: normal.clone(), binormal: binormal.clone() })
  }
  return frames
}

function makeStrand(
  index: number,
  frames: ReturnType<typeof transportedFrames>,
  twistTurns: number,
  random: () => number,
): StrandResult {
  // sqrt(random) produces uniform area density on the root disk.
  const rootRadius = 0.16 + Math.sqrt(random()) * 0.78
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const rootAngle = index * goldenAngle + (random() - 0.5) * 0.46
  const phase = random() * Math.PI * 2
  const handedness = random() > 0.16 ? 1 : -1
  const releaseAt = 0.86 + random() * 0.07
  const releaseDirection = (random() - 0.5) * 2
  const points: Vector3Tuple[] = frames.map((frame, sampleIndex) => {
    const t = sampleIndex / (frames.length - 1)
    const taper = 1 - 0.75 * t
    const pulse = 1 + 0.11 * Math.sin(t * Math.PI * 5 + phase)
    const angle = rootAngle + handedness * twistTurns * Math.PI * 2 * t
      + 0.22 * Math.sin(t * Math.PI * 3 + phase)
    const radius = rootRadius * taper * pulse
    const release = Math.max(0, (t - releaseAt) / (1 - releaseAt)) ** 2
    const lateral = radius * Math.cos(angle) + release * releaseDirection * (0.7 + rootRadius)
    const depth = radius * Math.sin(angle) + release * Math.sin(phase) * 0.75
    const vein = 0.035 * Math.sin(t * Math.PI * 11 + phase)
    const point = frame.center.clone()
      .addScaledVector(frame.normal, lateral + vein)
      .addScaledVector(frame.binormal, depth)
      .addScaledVector(frame.tangent, 0.06 * Math.sin(t * Math.PI * 7 + phase))
    return point.toArray() as Vector3Tuple
  })

  const depth = rootRadius / 1.14
  const channel = index % 9 === 0 ? 'nerve' : depth < 0.56 ? 'core' : 'sinew'
  const thickness = channel === 'core' ? 0.052 + random() * 0.015 : 0.012 + random() * 0.018
  const source = geo.line({
    key: `strand-${index}`,
    points,
    path: 'smooth',
    thickness,
    tubularSegments: Math.max(24, frames.length * 2),
    radialSegments: channel === 'core' ? 9 : 7,
  })
    .material(channel)
    .named(`strand-${index}`)

  return { source, tip: points[points.length - 1] }
}

export function organicBundle(options: OrganicBundleOptions): GeometrySource {
  const random = mulberry32(options.seed)
  const frameCount = Math.max(8, Math.round(options.samples * options.growth))
  const frames = transportedFrames(frameCount, options.growth)
  const strands = Array.from({ length: options.strands }, (_, index) =>
    makeStrand(index, frames, options.twistTurns, random))

  const guidePoints = frames.map(frame => frame.center.toArray() as Vector3Tuple)
  const spinalCord = geo.line({
    key: 'guide-spine',
    points: guidePoints,
    path: 'smooth',
    thickness: 0.16,
    tubularSegments: frameCount * 2,
    radialSegments: 10,
  }).material('marrow').named('guide-spine')

  const tips = geo.icosphere({ radius: 0.07, detail: 1, key: 'growth-tip' })
    .distribute({ points: strands.map((strand, index) => ({ key: `tip-${index}`, position: strand.tip })) })
    .material('tips')
    .named('growth-tips')

  return spinalCord
    .join(strands.map(strand => strand.source), { key: 'living-cable' })
    .join(tips)
    .transform({ scale: 0.75 })
}
