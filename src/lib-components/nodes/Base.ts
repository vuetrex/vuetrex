import {ref, computed, queuePostFlushCb, ComputedRef, Ref, shallowRef} from 'vue';

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
    protected children: Ref<Base[]> = ref([]);

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

    appendChild(child: Base) {
        child.parent.value = this;
        this.children.value.push(child);
        this.registerSync();
    }

    removeChild(child: Base) {
        child.parent.value = null;
        const idx = this.children.value.indexOf(child);
        if (idx >= 0) {
            this.children.value.splice(idx, 1);
            child.onRemoved();
            if (child.isRenderableNode()) {
                const node = child as any;
                if (node.stage && node.element) {
                    node.stage.connectors.remove(node.element);
                }
            }
            const grandChildren = child.children.value;
            while (grandChildren && grandChildren.length > 0)
                child.removeChild(grandChildren[grandChildren.length - 1]);
            this.registerSync();
        }
    }

    insertBefore(child: Base, anchor: Base) {
        child.parent.value = this;
        const anchorIdx = this.children.value.indexOf(anchor);
        if (anchorIdx >= 0) {
            this.children.value.splice(anchorIdx, 0, child);
        } else {
            this.children.value.push(child);
        }
        this.registerSync();
    }

    registerSync() {
        if (!this.mustSync) {
            this.mustSync = true
            registerUpdatedBase(this)
        }
    }

    applySync(): void {
        this.children.value.forEach(b => {
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
        if (this.state !== undefined && key in this.state) {
            switch (typeof this.state[key]) {
                case 'boolean': this.state[key] = "true" == value; break;
                case 'number':  this.state[key] = Number.parseFloat(value); break;
                default: this.state[key] = value;
            }
        } else {
            (this as any)[key] = value
        }
    }

    onRemoved() {}
}
