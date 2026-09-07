export function hashString(value: string): number {
    let hash = 2166136261
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

/** A deterministic random value in [0, 1), independently keyed by channel. */
export function keyedRandom(seed: string | number, key: string, channel: string): number {
    let state = hashString(`${seed}\u0000${key}\u0000${channel}`)
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

export function randomBetween(
    seed: string | number,
    key: string,
    channel: string,
    minimum: number,
    maximum: number,
): number {
    return minimum + (maximum - minimum) * keyedRandom(seed, key, channel)
}

