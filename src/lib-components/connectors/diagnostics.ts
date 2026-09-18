import { compileConnectors } from '@/lib-components/connectors/compiler/evaluator.js'
import { connectorGraphSignature } from '@/lib-components/connectors/graph.js'
import type {
    ConnectorGraphDescription,
    ConnectorGraphNodeDescription,
    ConnectorInspection,
    ConnectorParameterValues,
    ConnectorSource,
} from '@/lib-components/connectors/types.js'

export function describeConnectorGraph(source: ConnectorSource): ConnectorGraphDescription {
    const kinds: Record<string, number> = {}
    let nodeCount = 0
    const visiting = new WeakSet<ConnectorSource>()
    const describe = (node: ConnectorSource): ConnectorGraphNodeDescription => {
        if (visiting.has(node)) throw new Error(`Cyclic connector graph detected at '${node.kind}'.`)
        visiting.add(node)
        nodeCount++
        kinds[node.kind] = (kinds[node.kind] ?? 0) + 1
        try {
            const inputs = Object.values(node.inputs).flatMap(input =>
                !input ? [] : Array.isArray(input) ? input : [input]) as ConnectorSource[]
            return Object.freeze({
                kind: node.kind,
                ...(node.key ? { key: node.key } : {}),
                inputs: Object.freeze(inputs.map(describe)),
            })
        } finally {
            visiting.delete(node)
        }
    }
    const root = describe(source)
    return Object.freeze({ nodeCount, kinds: Object.freeze({ ...kinds }), root })
}

export function connectorGraphToDot(source: ConnectorSource): string {
    const lines = ['digraph ConnectorGraph {']
    let sequence = 0
    const ids = new WeakMap<object, string>()
    const visit = (node: ConnectorSource): string => {
        let id = ids.get(node)
        if (id) return id
        id = `n${++sequence}`
        ids.set(node, id)
        lines.push(`  ${id} [label="${escapeDot(node.kind)}${node.key ? `\\n${escapeDot(node.key)}` : ''}"];`)
        for (const input of Object.values(node.inputs)) {
            const sources = !input ? [] : Array.isArray(input) ? input : [input]
            for (const child of sources) lines.push(`  ${visit(child)} -> ${id};`)
        }
        return id
    }
    visit(source)
    lines.push('}')
    return lines.join('\n')
}

export function inspectConnectors(
    source: ConnectorSource,
    parameters: ConnectorParameterValues = {},
): ConnectorInspection {
    const plan = compileConnectors(source, parameters)
    return Object.freeze({
        graph: describeConnectorGraph(source),
        recordCount: plan.records.length,
        edgeCount: plan.records.filter(record => record.topology === 'edge').length,
        busCount: plan.records.filter(record => record.topology === 'bus').length,
        names: Object.freeze([...new Set(plan.records.flatMap(record => record.names))].sort()),
        warnings: plan.warnings,
    })
}

export { connectorGraphSignature }

function escapeDot(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
