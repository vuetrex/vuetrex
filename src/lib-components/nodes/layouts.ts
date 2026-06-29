import { Vector3 } from 'three';

export interface Layout {
    measure(children: Vector3[], gap: number): Vector3
    place(index: number, children: Vector3[], gap: number): Vector3
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const maxOr0 = (ns: number[]) => (ns.length ? Math.max(...ns) : 0);

const linearMeasure = (children: Vector3[], gap: number, axis: 'x' | 'z'): Vector3 => {
    if (!children.length) return new Vector3();
    const extent = sum(children.map(c => c[axis])) + gap * (children.length - 1);
    const w = axis === 'x' ? extent : maxOr0(children.map(c => c.x));
    const d = axis === 'z' ? extent : maxOr0(children.map(c => c.z));
    return new Vector3(w, maxOr0(children.map(c => c.y)), d);
};

const linearPlace = (index: number, children: Vector3[], gap: number, axis: 'x' | 'z'): Vector3 => {
    if (!children.length) return new Vector3();
    const extent = sum(children.map(c => c[axis])) + gap * (children.length - 1);
    const before = sum(children.slice(0, index).map(c => c[axis])) + gap * index;
    const offset = -extent / 2 + before + children[index][axis] / 2;
    return axis === 'x' ? new Vector3(offset, 0, 0) : new Vector3(0, 0, offset);
};

export const horizontalLayout: Layout = {
    measure: (children, gap) => linearMeasure(children, gap, 'x'),
    place: (index, children, gap) => linearPlace(index, children, gap, 'x'),
};

export const depthLayout: Layout = {
    measure: (children, gap) => linearMeasure(children, gap, 'z'),
    place: (index, children, gap) => linearPlace(index, children, gap, 'z'),
};

export const stackLayout: Layout = {
    measure(children, gap) {
        if (!children.length) return new Vector3();
        const height = sum(children.map(c => c.y)) + gap * (children.length - 1);
        return new Vector3(maxOr0(children.map(c => c.x)), height, maxOr0(children.map(c => c.z)));
    },
    place(index, children, gap) {
        if (!children.length) return new Vector3();
        const y = sum(children.slice(0, index).map(c => c.y)) + gap * index;
        return new Vector3(0, y, 0);
    },
};

const ringRadius = (children: Vector3[], gap: number): number => {
    const n = children.length;
    if (n <= 1) return 0;
    const chord = maxOr0(children.map(c => Math.max(c.x, c.z))) + gap;
    return chord / (2 * Math.sin(Math.PI / n));
};

export const ringLayout: Layout = {
    measure(children, gap) {
        if (!children.length) return new Vector3();
        const r = ringRadius(children, gap);
        return new Vector3(
            2 * r + maxOr0(children.map(c => c.x)),
            maxOr0(children.map(c => c.y)),
            2 * r + maxOr0(children.map(c => c.z)),
        );
    },
    place(index, children, gap) {
        if (!children.length) return new Vector3();
        const r = ringRadius(children, gap);
        const angle = index * Math.PI * 2 / children.length;
        return new Vector3(r * Math.sin(angle), 0, r * Math.cos(angle));
    },
};

const gridDimensions = (count: number) => {
    const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / columns));
    return { columns, rows };
};

export const gridLayout: Layout = {
    measure(children, gap) {
        if (!children.length) return new Vector3();
        const { columns, rows } = gridDimensions(children.length);
        const cellX = maxOr0(children.map(c => c.x));
        const cellZ = maxOr0(children.map(c => c.z));
        return new Vector3(
            columns * cellX + gap * (columns - 1),
            maxOr0(children.map(c => c.y)),
            rows * cellZ + gap * (rows - 1),
        );
    },
    place(index, children, gap) {
        if (!children.length) return new Vector3();
        const { columns, rows } = gridDimensions(children.length);
        const cellX = maxOr0(children.map(c => c.x));
        const cellZ = maxOr0(children.map(c => c.z));
        const width = columns * cellX + gap * (columns - 1);
        const depth = rows * cellZ + gap * (rows - 1);
        const column = index % columns;
        const row = Math.floor(index / columns);
        return new Vector3(
            -width / 2 + column * (cellX + gap) + cellX / 2,
            0,
            -depth / 2 + row * (cellZ + gap) + cellZ / 2,
        );
    },
};
