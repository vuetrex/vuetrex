import { bindSceneErrors, recordSceneProp, runSceneOperation, sceneError, type SceneErrorHandler } from './diagnostics/sceneErrors.js'
import { Comment } from './nodes/Root.js'
import { createRenderer, RootRenderFunction } from 'vue';
import { nodeOps } from '@/lib-components/nodeOps.js';
import { patchProp } from '@/lib-components/patchProp.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';
import { Base } from '@/lib-components/nodes/Base.js';
import { types, ElementRegistry } from '@/lib-components/nodes/types.js';

/**
 * Vuetrex Stage requires implementation of Vue's Custom Renderer to hijack painting of boxes and cylinders and other
 * 3D elements.
 * To do that it needs to implement needs to implement the following via a factory function below:
 * <pre><code>
 * interface RendererOptions<HostNode = RendererNode, HostElement = RendererElement> {
 *     patchProp(el: HostElement, key: string, prevValue: any, nextValue: any,
 *         namespace?: ElementNamespace,
 *         parentComponent?: ComponentInternalInstance | null
 *        ): void;
 *     forcePatchProp?(el: HostElement, key: string): boolean;
 *     insert(el: HostNode, parent: HostElement, anchor?: HostNode | null): void;
 *     remove(el: HostNode): void;
 *     createElement(type: string, isSVG?: boolean, isCustomizedBuiltIn?: string): HostElement;
 *     createText(text: string): HostNode;
 *     createComment(text: string): HostNode;
 *     setText(node: HostNode, text: string): void;
 *     setElementText(node: HostElement, text: string): void;
 *     parentNode(node: HostNode): HostElement | null;
 *     nextSibling(node: HostNode): HostNode | null;
 *     querySelector?(selector: string): HostElement | null;
 *     setScopeId?(el: HostElement, id: string): void;
 *     cloneNode?(node: HostNode): HostNode;
 *     insertStaticContent?(content: string, parent: HostElement, anchor: HostNode | null, isSVG: boolean): HostElement[];
 * }
 * </code></pre>
 *
 * @param stage Vuetrex Stage
 */

export function createRendererForStage(stage: VuetrexStage, extraTypes?: ElementRegistry, onError?: SceneErrorHandler): RootRenderFunction<Base> {
    const operations = nodeOps(stage, extraTypes)
    const create = operations.createElement
    const insert = operations.insert
    const { render } = createRenderer({
        ...operations,
        createElement(tag, namespace, is, props) {
            if (!onError) return create(tag, namespace, is, props)
            try {
                if (!(extraTypes?.[tag] ?? types[tag])) throw new Error(`Unknown scene tag: ${tag}`)
                const node = create(tag, namespace, is, props)
                bindSceneErrors(node, tag, onError, props?.id ?? props?.name)
                return node
            } catch (cause) {
                onError(sceneError(cause, tag, 'create', undefined, props?.id ?? props?.name))
                return new Comment(`Invalid scene element: ${tag}`)
            }
        },
        patchProp(el, key, prev, next, namespace, parent) {
            recordSceneProp(el, key, next)
            runSceneOperation(el, 'prop', () => patchProp(el, key, prev, next, namespace, parent), key)
        },
        insert(child, parent, anchor) {
            let inserted = false
            runSceneOperation(child, 'insert', () => { insert(child, parent, anchor); inserted = true })
            if (!inserted && !child.getHostParent()) child.onRemoved()
        },
    });
    return render;
}
