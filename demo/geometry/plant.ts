import { defineGeometry, geo, type GeometrySource } from '@/lib-components/index.js'

export interface TreeParameters {
    height: number
    trunkRadius: number
    branchCount: number
    branchLength: number
    forkCount: number
    leafCount: number
    leafSize: number
    spread: number
    seed: number
}

interface BranchParameters {
    length: number
    radius: number
    levels: number
    forkCount: number
    leafCount: number
    leafSize: number
    spread: number
    seed: number
}

const BRANCH_LEVELS = 4

function stem(length: number, radius: number): GeometrySource {
    return geo.material(geo.line({
        length,
        thickness: radius,
        radialSegments: 5,
        tubularSegments: 5,
    }), 'bark')
}

function foliage(parameters: BranchParameters): GeometrySource {
    // Match the branch convention: local +Y is the long, outward-pointing axis.
    const leaf = geo.transform(geo.icosphere({ radius: 1, detail: 1 }), {
        // Icospheres are centered; move this one forward so its base is at the fork.
        translate: [0, parameters.leafSize, 0],
        scale: [parameters.leafSize * 0.38, parameters.leafSize, parameters.leafSize * 0.12],
    })

    return geo.material(geo.randomize(
        // Leaves now follow the same deterministic placement and direction as forks.
        geo.distribute(leaf, forkPattern(
            parameters.leafCount,
            parameters.length,
            parameters.spread,
            parameters.seed,
        )), {
        seed: parameters.seed,
        scale: [0.28, 1.14],
        color: [0x70866e, 0xa0bb8e],
    }), 'foliage')
}

function forkPattern(count: number, length: number, spread: number, seed: number) {
    return {
        pattern: 'custom' as const,
        count,
        placement(index: number, total: number) {
            const unit = (index + 1) / (total + 1)
            const angle = seed * 0.071 + index * Math.PI * (3 - Math.sqrt(5))

            return {
                key: `fork-${index}`,
                // Keep attachments in the lower-to-middle portion of each stem.
                position: [0, length * (0.24 + unit * 0.54), 0] as const,
                direction: [Math.cos(angle) * spread, 0.72 + unit * 0.12, Math.sin(angle) * spread] as const,
                scale: 0.94 + Math.sin(seed + index * 2.17) * 0.04,
            }
        },
    }
}

function branch(parameters: BranchParameters): GeometrySource {
    const segment = stem(parameters.length, parameters.radius)
    if (parameters.levels === 1) return geo.join([segment, foliage(parameters)])

    // One smaller branch graph is reused at every fork through all configured levels.
    const children = geo.distribute(branch({
        ...parameters,
        length: parameters.length * 0.66,
        radius: parameters.radius * 0.64,
        levels: parameters.levels - 1,
        seed: parameters.seed + 97,
    }), forkPattern(parameters.forkCount, parameters.length, parameters.spread, parameters.seed))

    return geo.join([segment, children])
}

export const tree = defineGeometry<TreeParameters>('plant.tree', parameters => {
    const trunk = stem(parameters.height, parameters.trunkRadius)
    const crown = geo.distribute(branch({
        length: parameters.branchLength,
        radius: parameters.trunkRadius * 0.28,
        levels: BRANCH_LEVELS,
        forkCount: parameters.forkCount,
        leafCount: parameters.leafCount,
        leafSize: parameters.leafSize,
        spread: parameters.spread,
        seed: parameters.seed + 101,
    }), forkPattern(parameters.branchCount, parameters.height, parameters.spread, parameters.seed))

    return geo.join([trunk, crown], { key: 'complete-tree' })
})
