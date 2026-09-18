import type {
    ConnectorAppearanceBackendFactory,
} from '@/lib-components/connectors/types.js'

const appearances = new Map<string, ConnectorAppearanceBackendFactory>()

/** Register an application-specific connector appearance backend. */
export function registerConnectorAppearance(
    name: string,
    factory: ConnectorAppearanceBackendFactory,
): () => void {
    const normalized = name.trim()
    if (!normalized) throw new TypeError('Connector appearance names must not be empty.')
    if (typeof factory !== 'function') throw new TypeError('Connector appearance factories must be functions.')
    appearances.set(normalized, factory)
    return () => {
        if (appearances.get(normalized) === factory) appearances.delete(normalized)
    }
}

/** Snapshot global registrations so mounted stages cannot be changed behind their back. */
export function connectorAppearanceSnapshot(): ReadonlyMap<string, ConnectorAppearanceBackendFactory> {
    return new Map(appearances)
}
