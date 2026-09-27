import { watchScene } from '../diagnostics/sceneErrors.js'
import { reactive, toRaw, watch, type WatchStopHandle } from 'vue'
import { stableValue } from '../connectors/compiler/evaluator.js'
import { StageDeclaration } from './StageDeclaration.js'
import { Node } from './Node.js'
import type { VuetrexStage } from '../three/stage.js'
import type { ConnectorPortDeclarationRecord } from '../connectors/declarations.js'

const faces = ['left', 'right', 'front', 'back', 'top', 'bottom']
export class PortDeclaration extends StageDeclaration {
    declare protected state: ConnectorPortDeclarationRecord
    private stopHandle?: WatchStopHandle
    private owner?: Node
    constructor(stage: VuetrexStage) {
        super(stage)
        this.state = reactive({ name: '', position: undefined, normal: undefined, face: undefined, at: undefined,
            override: false, disabled: false, direction: undefined })
    }
    protected override setDeclarationProp(key: string, value: unknown): void {
        if (!Object.hasOwn(toRaw(this.state), key)) return super.setDeclarationProp(key, value)
        if (key === 'override' || key === 'disabled') this.state[key] = this.booleanProp(key, value ?? false)
        else (this.state as any)[key] = value ?? undefined
    }
    snapshot(): ConnectorPortDeclarationRecord {
        const value = this.state
        if (typeof value.name !== 'string' || !value.name.trim()) throw new Error('vx-port requires a unique name on its owner.')
        if (value.direction !== undefined && !['in', 'out', 'bidirectional'].includes(value.direction)) throw new Error('Invalid vx-port direction.')
        const exact = value.position !== undefined || value.normal !== undefined
        if (exact && (value.face !== undefined || value.at !== undefined)) throw new Error('vx-port position/normal and face/at are mutually exclusive.')
        if (!value.face && value.at !== undefined) throw new Error('vx-port at requires a face.')
        if (value.disabled && !value.override) throw new Error('Only an override port may be disabled.')
        if (!(value.disabled && !exact && !value.face)) {
            if (exact) {
                for (const vector of [value.position, value.normal]) {
                    if (!Array.isArray(vector) || vector.length !== 3 || !Array.from(vector).every(Number.isFinite)) throw new Error('vx-port requires finite position and normal triples together.')
                }
                if (value.normal!.every(n => n === 0)) throw new Error('vx-port normal must be nonzero.')
            } else {
                if (!value.face || !faces.includes(value.face)) throw new Error('vx-port requires a face or position and normal.')
                if (value.at !== undefined && (!Array.isArray(value.at) || value.at.length !== 2 || !Array.from(value.at).every(n => Number.isFinite(n) && n >= 0 && n <= 1))) throw new Error('vx-port at must contain two coordinates in [0, 1].')
            }
        }
        return Object.freeze({ ...value,
            position: value.position && Object.freeze([...value.position]) as typeof value.position,
            normal: value.normal && Object.freeze([...value.normal]) as typeof value.normal,
            at: value.at && Object.freeze([...value.at]) as typeof value.at })
    }
    syncWithThree(): void {
        if (this.stopHandle) return
        this.stopHandle = watchScene(this, () => {
            const owner = this.parent.value
            if (!owner) return undefined
            if (!(owner instanceof Node) || !owner.hasExplicitId) throw new Error('vx-port requires a direct spatial parent with an explicit semantic id.')
            void owner.id
            return { owner, ports: collectPorts(owner) }
        }, result => {
            if (this.owner && this.owner !== result?.owner) refreshPorts(this.owner, false)
            this.owner = result?.owner
            if (result) {
                commitPorts(result.owner, result.ports)
            }
        }, { immediate: true, flush: 'post' })
    }
    onRemoved(): void {
        this.stopHandle?.()
        this.stopHandle = undefined
        if (this.owner) refreshPorts(this.owner, false)
        this.owner = undefined
    }
}
function collectPorts(owner: Node, validate = true): ReadonlyMap<string, ConnectorPortDeclarationRecord> {
    const base = new Map<string, ConnectorPortDeclarationRecord>()
    const overrides = new Map<string, ConnectorPortDeclarationRecord>()
    for (const child of owner.getHostChildren()) if (child instanceof PortDeclaration) {
        const record = child.snapshot()
        const target = record.override ? overrides : base
        if (validate && (target.has(record.name) || (!record.override && Object.hasOwn(owner.connectorPorts(), record.name)))) throw new Error(`Duplicate vx-port '${record.name}' on '${owner.id}'. Use one explicit override.`)
        target.set(record.name, record)
    }
    for (const [name, record] of overrides) {
        if (validate && !base.has(name) && !Object.hasOwn(owner.connectorPorts(), name)) throw new Error(`Port override '${name}' has no built-in port on '${owner.id}'.`)
        base.set(name, record)
    }
    return base
}
function refreshPorts(owner: Node, validate: boolean): void {
    if (owner.removing) { owner.declaredConnectorPorts = new Map(); return }
    commitPorts(owner, collectPorts(owner, validate))
}

function commitPorts(owner: Node, ports: ReadonlyMap<string, ConnectorPortDeclarationRecord>): void {
    const names = new Set([...owner.declaredConnectorPorts.keys(), ...ports.keys()].filter(name =>
        stableValue(owner.declaredConnectorPorts.get(name)) !== stableValue(ports.get(name))))
    owner.declaredConnectorPorts = ports
    if (names.size) owner.stage.connectors.updatePorts(owner.element, names)
}
