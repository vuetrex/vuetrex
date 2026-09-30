import { describe, expect, it } from 'vitest'
import * as api from '@/lib-components/index.js'
import { types } from '@/lib-components/nodes/types.js'
import { VuetrexStage } from '@/lib-components/three/stage.js'
import { Connectors } from '@/lib-components/three/connectors/connectors.js'

describe('public API cleanup', () => {
    it('publishes the curated layout and geometry extension surface', () => {
        for (const name of [
            'Node', 'GroupNode', 'Row', 'Stack', 'Ring', 'Layer', 'Panel', 'Spacer',
            'MeshNode', 'Box', 'Cylinder', 'Wedge', 'InstanceNode', 'GeometryNode',
        ]) {
            expect(api[name as keyof typeof api], name).toBeTypeOf('function')
        }
        for (const name of [
            'horizontalLayout', 'depthLayout', 'stackLayout', 'ringLayout', 'gridLayout', 'layoutWithDirection',
        ]) {
            expect(api[name as keyof typeof api], name).toBeDefined()
        }
        for (const name of ['Root', 'nodeOps', 'patchProp', 'GeometryEvaluator', 'GeometryRealizer']) {
            expect(api).not.toHaveProperty(name)
        }
    })

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
