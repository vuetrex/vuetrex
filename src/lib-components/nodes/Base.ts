import {computed, queuePostFlushCb, ComputedRef, Ref, shallowRef, toRaw, triggerRef} from 'vue';

// defer synchronization until after rendering for all nodes to have complete data about parents and children
const pendingSyncBase: Base[] = [];
let pending = false;

const flushChanges = () => {
    pendingSyncBase.forEach(base => {
        base.applySync()
    })
    pendingSyncBase.length = 0
    pending = false
};

const registerUpdatedBase = (base: Base) => {
    pendingSyncBase.push(base)
    if (!pending) {
        queuePostFlushCb(() => flushChanges())
        pending = true
    }
};

/**
 * Base class of render elements of Vuetrex renderer. Handles tree hierarchy: children, siblings, etc.
 */
export abstract class Base {

    public parent: Ref<Base | null> = shallowRef(null);
    // Vue calls host operations while a component update is in progress. Keep
    // untracked mirrors for those operations, then notify public reactive views
    // explicitly so renderer bookkeeping cannot become a render dependency.
    private parentNodeValue: Base | null = null;
    private readonly childList: Base[] = [];
    protected children: Ref<Base[]> = shallowRef(this.childList);

    protected abstract get state():  { [id: string] : any };

    private mustSync = false;

    isRenderableNode(): boolean { return false; }

    readonly elements = computed(() => {
        return this.children.value.filter(c => c.isRenderableNode())
    })

    public myIdx: ComputedRef<number> = computed(() => {
        const res = this.parent.value?.elements.value.indexOf(this);
        return res === undefined ? -1 : res;
    })

    public readonly nextSibling : ComputedRef<Base | null> = computed(() => {
            if (this.parent.value === null) {
                return null;
            }
            const arr = this.parent.value.children.value;
            const idx = arr.indexOf(this);
            let result = null
            if (idx >= 0 && idx < arr.length-1) {
                result = arr[idx + 1]
            }
            return result
    })

    public getHostParent(): Base | null {
        return this.parentNodeValue;
    }

    public getHostNextSibling(): Base | null {
        const parent = this.parentNodeValue;
        if (parent === null) {
            return null;
        }
        const idx = parent.childList.indexOf(this);
        return idx >= 0 && idx < parent.childList.length - 1
            ? parent.childList[idx + 1]
            : null;
    }

    private setParent(parent: Base | null): void {
        this.parentNodeValue = parent;
        this.parent.value = parent;
    }

    appendChild(child: Base) {
        child.setParent(this);
        this.childList.push(child);
        triggerRef(this.children);
        this.registerSync();
    }

    removeChild(child: Base) {
        const idx = this.childList.indexOf(child);
        if (idx >= 0) {
            child.setParent(null);
            this.childList.splice(idx, 1);
            triggerRef(this.children);
            child.onRemoved();
            if (child.isRenderableNode()) {
                const node = child as any;
                if (node.stage && node.element) {
                    node.stage.connectors.remove(node.element);
                }
            }
            const grandChildren = child.childList;
            while (grandChildren && grandChildren.length > 0)
                child.removeChild(grandChildren[grandChildren.length - 1]);
            this.registerSync();
        }
    }

    insertBefore(child: Base, anchor: Base) {
        child.setParent(this);
        const anchorIdx = this.childList.indexOf(anchor);
        if (anchorIdx >= 0) {
            this.childList.splice(anchorIdx, 0, child);
        } else {
            this.childList.push(child);
        }
        triggerRef(this.children);
        this.registerSync();
    }

    registerSync() {
        if (!this.mustSync) {
            this.mustSync = true
            registerUpdatedBase(this)
        }
    }

    applySync(): void {
        this.childList.forEach(b => {
            b.syncWithThree()
        })
        this.mustSync = false
    }

    syncWithThree() {
    }

    setElementText(text: string) {
        // Default: ignore text.
    }

    public setStateValue(key: string, value:any): void {
        // Vue's custom renderer forwards template attribute names verbatim, so
        // multi-word bindings arrive as kebab-case (e.g. `label-align`,
        // `label-font-size`) while our reactive state uses camelCase fields
        // (`labelAlign`, `labelFontSize`). Normalize once here so every
        // camelCase state key is addressable from templates without each
        // subclass having to re-implement the mapping. Direct kebab-case
        // usage (e.g. `ring.setStateValue('start-angle', 90)` from tests)
        // keeps working thanks to this same normalization.
        const stateKey = key.indexOf('-') >= 0
            ? key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
            : key;
        const state = this.state;
        // Inspect the raw state to avoid subscribing the active component
        // render to the same property that patchProp is about to update.
        const rawState = state === undefined ? undefined : toRaw(state);
        if (rawState !== undefined && stateKey in rawState) {
            switch (typeof rawState[stateKey]) {
                case 'boolean': state[stateKey] = "true" == value; break;
                case 'number':  state[stateKey] = Number.parseFloat(value); break;
                default: state[stateKey] = value;
            }
        } else {
            (this as any)[key] = value
        }
    }

    onRemoved() {}
}
