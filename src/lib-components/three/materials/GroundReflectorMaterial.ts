import * as THREE from 'three'

interface GroundReflectorShader {
    uniforms: Record<string, THREE.IUniform>
    vertexShader: string
    fragmentShader: string
}

export interface GroundReflectorMaterialOptions {
    floorTexture: THREE.Texture
    reflectionTexture: THREE.Texture
    reflectionTextureMatrix: THREE.Matrix4
    reflectionColor: THREE.ColorRepresentation
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
            color: 0xf0f0f0,
            roughness: 0.7,
            metalness: 0.5,
            map: options.floorTexture,
            transparent: false,
            depthWrite: true,
        })
        this.name = 'vx-ground-reflector-material'
        this.customProgramCacheKey = () => 'vx-ground-reflector-material-v1'
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
        }
    }
}
