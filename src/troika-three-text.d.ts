/**
 * Minimal ambient declaration for `troika-three-text`.
 *
 * The package ships full `.d.ts` files under `dist/types/` but its
 * `package.json` does not declare a `types`/`typings` field, so nodenext
 * module resolution can't find them. This ambient module gives us just
 * enough surface area for the on-mesh label pipeline in `MeshNode` without
 * pulling in the vendored declarations (which are not shipped in a way
 * TS can consume without editing node_modules).
 *
 * At runtime `Text` extends `THREE.Mesh`, so `.parent`, `.position`,
 * `.rotation`, `.add()`, etc. all work; we simply don't re-declare them
 * here — the `MeshNode` reference is typed as `any` for those touches.
 */
declare module 'troika-three-text' {
    export class Text {
        text: string;
        anchorX: number | string;
        anchorY: number | string;
        font: string | null | undefined;
        fontSize: number;
        maxWidth: number;
        lineHeight: number | 'normal';
        textAlign: 'left' | 'right' | 'center' | 'justify';
        color: number | string;
        sync(callback?: () => void): void;
        dispose(): void;
    }
}
