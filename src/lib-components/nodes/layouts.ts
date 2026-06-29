import type {Node} from '@/lib-components/nodes/Node.js';
import type {VuetrexStage} from '@/lib-components/three/stage.js';
import {Vector3} from 'three';

export type LayoutFn = (child: Node, siblings: Node[], stage: VuetrexStage) => Vector3
type SlotSizeFn = (containerSize: Vector3, child: Node, siblings: Node[], stage: VuetrexStage) => Vector3

export type LayoutFactory = ((containerPos: Vector3, containerSize: Vector3) => LayoutFn) & {
    slotSizeOf?: SlotSizeFn
}

const childHeight = (child: Node) => {
    const height = (child as any).state?.height;
    return typeof height === 'number' && Number.isFinite(height) ? height : 0;
};

const childIndex = (child: Node, siblings: Node[]) => {
    const idx = siblings.indexOf(child);
    return idx >= 0 ? idx : 0;
};

const childCount = (siblings: Node[]) => Math.max(siblings.length, 1);

const gridDimensions = (count: number, size: Vector3) => {
    const safeCount = Math.max(count, 1);
    const aspect = size.z === 0 ? 1 : Math.max(size.x / size.z, 0.1);
    const columns = Math.max(1, Math.ceil(Math.sqrt(safeCount * aspect)));
    const rows = Math.max(1, Math.ceil(safeCount / columns));
    return { columns, rows };
};

const createLayoutFactory = (
    layout: (containerPos: Vector3, containerSize: Vector3, child: Node, siblings: Node[], stage: VuetrexStage) => Vector3,
    slotSizeOf: SlotSizeFn,
) => {
    const factory = ((containerPos: Vector3, containerSize: Vector3) => {
        return (child: Node, siblings: Node[], stage: VuetrexStage) => layout(containerPos, containerSize, child, siblings, stage);
    }) as LayoutFactory;
    factory.slotSizeOf = slotSizeOf;
    return factory;
};

export const horizontalLayout = createLayoutFactory(
    (containerPos, containerSize, child, siblings, _stage) => {
        void _stage;
        const count = childCount(siblings);
        const idx = childIndex(child, siblings);
        const slotWidth = containerSize.x / count;
        const minX = containerPos.x - containerSize.x / 2;

        return new Vector3(
            minX + slotWidth * (idx + 0.5),
            containerPos.y, //todo + childHeight(child) / 2 + child.getElevation(),
            containerPos.z,
        );
    },
    (containerSize, _child, siblings) => new Vector3(
        containerSize.x / childCount(siblings),
        containerSize.y,
        containerSize.z,
    ),
);

export const depthLayout = createLayoutFactory(
    (containerPos, containerSize, child, siblings, _stage) => {
        void _stage;
        const count = childCount(siblings);
        const idx = childIndex(child, siblings);
        const slotDepth = containerSize.z / count;
        const minZ = containerPos.z - containerSize.z / 2;

        return new Vector3(
            containerPos.x,
            containerPos.y, //todo + childHeight(child) / 2 + child.getElevation(),
            minZ + slotDepth * (idx + 0.5),
        );
    },
    (containerSize, _child, siblings) => new Vector3(
        containerSize.x,
        containerSize.y,
        containerSize.z / childCount(siblings),
    ),
);

export const stackLayout = createLayoutFactory(
    (containerPos, _containerSize, child, siblings, _stage) => {
        void _containerSize;
        void _stage;
        const idx = childIndex(child, siblings);
        const baseY = containerPos.y;
        const precedingHeight = siblings
            .slice(0, idx)
            .reduce((sum, sibling) => sum + childHeight(sibling), 0);
        const height = childHeight(child);

        return new Vector3(
            containerPos.x,
            baseY + precedingHeight + height / 2 + child.getElevation(),
            containerPos.z,
        );
    },
    (containerSize, _child, siblings) => new Vector3(
        containerSize.x,
        childHeight(_child) || containerSize.y,
        containerSize.z,
    ),
);

export const ringLayout = createLayoutFactory(
    (containerPos, containerSize, child, siblings, _stage) => {
        void _stage;
        const count = childCount(siblings);
        const idx = childIndex(child, siblings);
        const radius = Math.min(containerSize.x, containerSize.z) / 2;
        const angle = idx * Math.PI * 2 / count;

        return new Vector3(
            containerPos.x + radius * Math.sin(angle),
            containerPos.y, //todo + childHeight(child) / 2 + child.getElevation(),
            containerPos.z + radius * Math.cos(angle),
        );
    },
    (containerSize, _child, siblings) => {
        const count = childCount(siblings);
        const radius = Math.min(containerSize.x, containerSize.z) / 2;
        const chord = count > 1 ? 2 * radius * Math.sin(Math.PI / count) : radius * 2;
        return new Vector3(chord, containerSize.y, chord);
    },
);

export const gridLayout = createLayoutFactory(
    (containerPos, containerSize, child, siblings, _stage) => {
        void _stage;
        const { columns, rows } = gridDimensions(siblings.length, containerSize);
        const idx = childIndex(child, siblings);
        const column = idx % columns;
        const row = Math.floor(idx / columns);
        const slotWidth = containerSize.x / columns;
        const slotDepth = containerSize.z / rows;
        const minX = containerPos.x - containerSize.x / 2;
        const minZ = containerPos.z - containerSize.z / 2;

        return new Vector3(
            minX + slotWidth * (column + 0.5),
            containerPos.y + childHeight(child) / 2 + child.getElevation(),
            minZ + slotDepth * (row + 0.5),
        );
    },
    (containerSize, child, siblings) => {
        const { columns, rows } = gridDimensions(siblings.length, containerSize);
        void child;

        return new Vector3(
            containerSize.x / columns,
            containerSize.y,
            containerSize.z / rows,
        );
    },
);
