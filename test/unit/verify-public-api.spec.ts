import { describe, expect, it } from 'vitest'
import * as api from '@/lib-components/index.js'
import { types } from '@/lib-components/nodes/types.js'
import { VuetrexStage } from '@/lib-components/three/stage.js'
import { Connectors } from '@/lib-components/three/connectors/connectors.js'

describe('public API cleanup', () => {
    it('exposes graph connectors without the removed compatibility APIs', () => {
        expect(types['vx-connectors']).toBeDefined()
        expect(api.geo.join).toBeTypeOf('function')
        expect(api.connectors.edge).toBeTypeOf('function')
        for (const name of ['ConnectorNode', 'BusConnectorNode']) {
            expect(api).not.toHaveProperty(name)
        }
        for (const tag of ['vx-connector', 'vx-bus-connector']) {
            expect(types).not.toHaveProperty(tag)
        }
        expect(api.geo).not.toHaveProperty('boolean')
        for (const name of ['connect', 'connectBus', 'disconnect', 'unregisterConnection']) {
            expect(VuetrexStage.prototype).not.toHaveProperty(name)
        }
        for (const name of ['register', 'registerBus', 'unregister', 'unregisterPair', 'getResolvedPath']) {
            expect(Connectors.prototype).not.toHaveProperty(name)
        }
    })
})
