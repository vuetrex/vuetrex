import { VuetrexStage } from '@/lib-components/three/stage.js';
import { VuetrexParticles, ParticleOptions } from '@/lib-components/three/connectors/particles.js';
import { Segment, ConnectorPath } from '@/lib-components/three/connectors/path.js';
import { ConnectorRenderer } from '@/lib-components/three/connectors/types.js';
import * as THREE from 'three';

const createParticleOptions = (): ParticleOptions => ({
    position: new THREE.Vector3(-2.5, 0.2, -0.5),
    positionRandomness: 1.05,
    velocity: new THREE.Vector3(0.1, 0, 0),
    minMax: new THREE.Vector2(-5.0, 5.0),
    particleSpread: 0.015,
    lifetime: 50,
    size: 0.8,
    sizeRandomness: 0.3
});

const MAX_PARTICLES = 22500;

const BASE_PARTICLE_SIZE = 0.3;
const BASE_SIZE_RANDOMNESS = 0.3;

export function scaledParticleMetrics(scale: number, baseSpread: number) {
    const normalizedScale = scale > 0 && Number.isFinite(scale) ? scale : 1
    return {
        spread: baseSpread * normalizedScale,
        size: BASE_PARTICLE_SIZE * normalizedScale,
        sizeRandomness: BASE_SIZE_RANDOMNESS * normalizedScale,
        velocityScale: normalizedScale,
    }
}

export class ParticleRenderer implements ConnectorRenderer {
    private particleSystem: VuetrexParticles;
    private readonly options = createParticleOptions();
    private readonly spawnRate: number;

    constructor(private stage: VuetrexStage) {
        this.particleSystem = new VuetrexParticles({
            blending: stage.settings.particleBlending,
            maxParticles: MAX_PARTICLES,
            color: stage.settings.particleColor || 0xa0ffff
        });
        this.stage.scene.add(this.particleSystem);
        this.options.particleSpread = stage.settings.particleSpread || 0.035;
        this.spawnRate = stage.settings.particleVolume || 10;
    }

    update(segments: Segment[], timer: number, tick: number): void {
        // Keep advancing the shared GPU clock after the last connector is
        // removed so already-spawned particles finish their lifetime instead
        // of freezing indefinitely in the scene.
        if (segments.length === 0) {
            this.particleSystem.update(tick);
            return;
        }

        // Create a temporary ConnectorPath to use its sample method
        // In a real refactor, we might want to move sample logic to a shared utility
        const path = new ConnectorPath();
        path.setSegments(segments);
        const totalLen = path.totaLength();
        const options = this.options;

        for (let idx = 0; idx < this.spawnRate; idx++) {
            const rnd = this.particleSystem.random();
            const xys = path.sample(rnd * totalLen);
            const s = xys.s;
            if (s === null) continue;
            const metrics = scaledParticleMetrics(s.scale, this.stage.settings.particleSpread || 0.035)

            const dx = s.endX - s.startX;
            const dy = s.endY - s.startY;
            const dz = s.endZ - s.startZ;
            const len = s.len || 1;
            options.particleSpread = metrics.spread;
            options.size = metrics.size;
            options.sizeRandomness = metrics.sizeRandomness;
            const clampStart = Math.abs(dz) < 0.0001 ? s.startX : s.startZ;
            const clampEnd = Math.abs(dz) < 0.0001 ? s.endX : s.endZ;
            options.minMax.set(Math.min(clampStart, clampEnd), Math.max(clampStart, clampEnd));
            options.position.copy(xys.position);
            options.velocity.set(
                dx / len / 50.0 * metrics.velocityScale,
                dy / len / 50.0 * metrics.velocityScale,
                dz / len / 50.0 * metrics.velocityScale,
            );
            this.particleSystem.spawnParticle(options);
        }
        this.particleSystem.update(tick);
    }

    dispose(): void {
        this.particleSystem.dispose();
        this.stage.scene.remove(this.particleSystem);
    }
}
