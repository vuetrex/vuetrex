import * as THREE from 'three'

interface GroundReflectorShader {
    uniforms: Record<string, THREE.IUniform>
    vertexShader: string
    fragmentShader: string
}

export interface GroundHorizonFadeOptions {
    horizonColor: THREE.ColorRepresentation
    fadeStart?: number
    fadeEnd?: number
}

export interface GroundSurfaceMaterialOptions extends GroundHorizonFadeOptions {
    floorTexture: THREE.Texture
}

export interface GroundReflectorMaterialOptions extends GroundSurfaceMaterialOptions {
    reflectionTexture: THREE.Texture
    reflectionTextureMatrix: THREE.Matrix4
    reflectionColor: THREE.ColorRepresentation
}

function hasHorizonFade(options: GroundHorizonFadeOptions): options is GroundHorizonFadeOptions & {
    fadeStart: number
    fadeEnd: number
} {
    return Number.isFinite(options.fadeStart)
        && Number.isFinite(options.fadeEnd)
        && options.fadeStart! >= 0
        && options.fadeEnd! > options.fadeStart!
}

function addHorizonFade(shader: GroundReflectorShader, options: GroundHorizonFadeOptions): void {
    if (!hasHorizonFade(options)) return

    shader.uniforms.vxHorizonColor = { value: new THREE.Color(options.horizonColor) }
    shader.uniforms.vxFloorFadeStart = { value: options.fadeStart }
    shader.uniforms.vxFloorFadeEnd = { value: options.fadeEnd }
    shader.vertexShader = replaceShaderChunk(shader.vertexShader,
        '#define STANDARD',
        `#define STANDARD
varying vec3 vxFloorWorldPosition;`)
    shader.vertexShader = replaceShaderChunk(shader.vertexShader,
        '#include <project_vertex>',
        `#include <project_vertex>
vxFloorWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
    shader.fragmentShader = replaceShaderChunk(shader.fragmentShader,
        '#define STANDARD',
        `#define STANDARD
uniform vec3 vxHorizonColor;
uniform float vxFloorFadeStart;
uniform float vxFloorFadeEnd;
varying vec3 vxFloorWorldPosition;`)
    // A solid scene background bypasses tone mapping. Blend in output space,
    // after tone mapping and fog, so the distant floor matches that background.
    shader.fragmentShader = replaceShaderChunk(shader.fragmentShader,
        '#include <premultiplied_alpha_fragment>',
        `float vxFloorExtent = max(abs(vxFloorWorldPosition.x), abs(vxFloorWorldPosition.z));
float vxHorizonFade = smoothstep(vxFloorFadeStart, vxFloorFadeEnd, vxFloorExtent);
vec3 vxHorizonOutput = linearToOutputTexel(vec4(vxHorizonColor, 1.0)).rgb;
gl_FragColor.rgb = mix(gl_FragColor.rgb, vxHorizonOutput, vxHorizonFade);
gl_FragColor.a = mix(gl_FragColor.a, 1.0, vxHorizonFade);

#include <premultiplied_alpha_fragment>`)
}

function commonSurfaceParameters(floorTexture: THREE.Texture): THREE.MeshStandardMaterialParameters {
    return {
        color: 0xf0f0f0,
        roughness: 0.7,
        metalness: 0.5,
        map: floorTexture,
        depthWrite: true,
    }
}

/** The non-reflective floor material, with an optional world-space horizon fade. */
export class GroundSurfaceMaterial extends THREE.MeshStandardMaterial {
    constructor(options: GroundSurfaceMaterialOptions) {
        super({ ...commonSurfaceParameters(options.floorTexture), transparent: true })
        this.name = 'vx-ground-surface-material'
        this.toneMapped = false
        this.customProgramCacheKey = () => `vx-ground-surface-material-${hasHorizonFade(options) ? 'fade' : 'plain'}`
        this.onBeforeCompile = (shader) => addHorizonFade(shader as GroundReflectorShader, options)
    }
}

function replaceShaderChunk(source: string, anchor: string, replacement: string): string {
    if (!source.includes(anchor)) {
        throw new Error(`Unable to build the ground reflector shader; missing Three.js shader chunk: ${anchor}`)
    }
    return source.replace(anchor, replacement)
}

/**
 * A lit floor material that combines the projected reflection and the
 * alpha-bearing floor texture in one opaque, depth-writing fragment.
 */
export class GroundReflectorMaterial extends THREE.MeshStandardMaterial {
    constructor(options: GroundReflectorMaterialOptions) {
        super({
            ...commonSurfaceParameters(options.floorTexture),
            transparent: false,
        })
        this.name = 'vx-ground-reflector-material'
        this.customProgramCacheKey = () => `vx-ground-reflector-material-v2-${hasHorizonFade(options) ? 'fade' : 'plain'}`
        this.onBeforeCompile = (shader) => {
            const groundShader = shader as GroundReflectorShader
            groundShader.uniforms.vxReflectionMap = { value: options.reflectionTexture }
            groundShader.uniforms.vxReflectionTextureMatrix = { value: options.reflectionTextureMatrix }
            groundShader.uniforms.vxReflectionColor = { value: new THREE.Color(options.reflectionColor) }

            groundShader.vertexShader = replaceShaderChunk(groundShader.vertexShader,
                '#define STANDARD',
                `#define STANDARD
uniform mat4 vxReflectionTextureMatrix;
varying vec4 vxReflectionUv;`)
            groundShader.vertexShader = replaceShaderChunk(groundShader.vertexShader,
                '#include <project_vertex>',
                `#include <project_vertex>
vxReflectionUv = vxReflectionTextureMatrix * vec4(position, 1.0);`)

            groundShader.fragmentShader = replaceShaderChunk(groundShader.fragmentShader, '#define STANDARD',
`#define STANDARD
uniform sampler2D vxReflectionMap;
uniform vec3 vxReflectionColor;
varying vec4 vxReflectionUv;

float vxBlendOverlay(float base, float blend) {
    return base < 0.5
        ? 2.0 * base * blend
        : 1.0 - 0.75 * (1.0 - base) * (1.0 - blend);
}

vec3 vxBlendOverlay(vec3 base, vec3 blend) {
    return vec3(
        vxBlendOverlay(base.r, blend.r),
        vxBlendOverlay(base.g, blend.g), 
        vxBlendOverlay(base.b, blend.b)
    );
}`,
            )
            groundShader.fragmentShader = replaceShaderChunk(groundShader.fragmentShader,
                '#include <map_fragment>',
                `#include <map_fragment>
float vxFloorOpacity = diffuseColor.a;`,
            )
            groundShader.fragmentShader = replaceShaderChunk(groundShader.fragmentShader,
                '#include <opaque_fragment>', `
// 1. Sample reflection directly
vec4 vxReflectionSample = texture2DProj(vxReflectionMap, vxReflectionUv);
vec3 reflectedRGB = vxReflectionSample.rgb;

// 2. Tint or desaturate the reflection to prevent harsh contrast/false colors
// Desaturate slightly by blending with grayscale, then multiply by floor tint
float luminance = dot(reflectedRGB, vec3(0.2126, 0.7152, 0.0722));
vec3 tintedReflection = mix(vec3(luminance), reflectedRGB, 0.75) * vxReflectionColor;

// 3. Smooth attenuation (dimming distant/bright reflections smoothly)
vec3 softReflection = tintedReflection * 0.7;

// 4. Blend cleanly with the floor base color
outgoingLight = mix(softReflection, outgoingLight, vxFloorOpacity);

#include <opaque_fragment>`
            );
            addHorizonFade(groundShader, options)
        }
    }
}
