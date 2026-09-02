import {Node} from '@/lib-components/nodes/Node.js';
import {Base} from '@/lib-components/nodes/Base.js';
import {gridLayout} from '@/lib-components/nodes/layouts.js';
import {Vector3} from 'three';

const ROOT_SPACE_CENTER = new Vector3(0, -0.1, 0)

export class Root extends Node {
    constructor(stage: any) {
        super(stage);
    }

    destroy() {
        while (this.children.value.length > 0)
            this.removeChild(this.children.value[this.children.value.length-1]);
        this.stage.destroy();
    }

    private gap(): number {
        const g = (this.stage as any).gap
        return typeof g === 'number' ? g : this.stage.boxDistance
    }

    override layoutPositionOf(child: Node): Vector3 {
        if (!child.participatesInLayout()) return super.layoutPositionOf(child).add(ROOT_SPACE_CENTER)
        const siblings = this.elements.value as Node[]
        const idx = siblings.indexOf(child)
        const footprints = siblings.map(s => s.measuredSize.value)
        const pos = gridLayout.place(idx < 0 ? 0 : idx, footprints, this.gap())
        pos.y += child.getElevation()
        return pos.add(ROOT_SPACE_CENTER)
    }
}

export class Comment extends Base {
    public readonly text: string;

    constructor(text: string) {
        super();
        this.text = text;
    }

    public get state() { return {}; }
}

export class TextNode extends Base {
    public text: string;

    constructor(text: string) {
        super();
        this.text = text;
    }

    public get state() { return {}; }

    setElementText(text: string) {
        this.text = text;
    }
}
