import {Node} from '@/lib-components/nodes/Node.js';
import {Base} from '@/lib-components/nodes/Base.js';
import {gridLayout} from '@/lib-components/nodes/layouts.js';
import {Vector3} from 'three';

const ROOT_SPACE_CENTER = new Vector3(0, -0.1, 0)
const ROOT_SPACE_SIZE = new Vector3(20, 15, 20)

export class Root extends Node {
    constructor(stage: any) {
        super(stage);
    }

    destroy() {
        while (this.children.value.length > 0)
            this.removeChild(this.children.value[this.children.value.length-1]);
        this.stage.destroy();
    }

    override layoutPositionOf(child: Node): Vector3 {
        return gridLayout(ROOT_SPACE_CENTER, ROOT_SPACE_SIZE)(child, this.elements.value as Node[], this.stage)
    }

    override allocatedSizeOf(child: Node): Vector3 {
        return gridLayout.slotSizeOf?.(ROOT_SPACE_SIZE, child, this.elements.value as Node[], this.stage)
            ?? ROOT_SPACE_SIZE.clone()
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
