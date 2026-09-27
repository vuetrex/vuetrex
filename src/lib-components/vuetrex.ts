import { sceneError, type VxSceneError } from './diagnostics/sceneErrors.js'
import type { VuetrexProps, VuetrexEvents, VxSettings } from './root-api.js';
import type { ComponentObjectPropsOptions } from 'vue';
import { mergeConnectorAppearances, mergeStyleSheets, styleSheetContextKey, useResolvedColorScheme, type VxColorScheme, type VxStyleSheetDefinition } from './styling/stylesheets.js';
import { createRendererForStage } from '@/lib-components/renderer.js';
import { computed, defineComponent, Fragment, shallowRef, onErrorCaptured, getCurrentInstance, nextTick, h, onMounted, onUnmounted, ref, PropType, watch, inject } from 'vue';
import { Root } from '@/lib-components/nodes/Root.js';
import { VuetrexStage, VxStage as _VxStage, VxMouseEvent as _VxMouseEvent } from '@/lib-components/three/stage.js';
import { ElementRegistry } from '@/lib-components/nodes/types.js';

export type VxStage = _VxStage;        // A ThreeJS scene rendered within a DOM element, supporting configurable camera and settings.
export type VxMouseEvent = _VxMouseEvent; // Enables click translation into 3D space to identify affected elements.

/** Root 3D scene container. See VuetrexProps for all attributes and VxSettings for initial configuration. */
export default defineComponent({
    name: "Vuetrex",
    props: {
        settings: { type: Object as PropType<VxSettings>, default: () => ({}) },
        position: { type: String, default: "static" },
        height: { type: String, default: "50vh" },
        width: { type: String, default: "100%" },
        stopped: { type: Boolean, default: false },
        sheets: { type: Array as PropType<readonly VxStyleSheetDefinition[]>, default: undefined },
        scheme: { type: String as PropType<VxColorScheme>, default: undefined },
        camera: {type: [String, Object] as PropType<VuetrexProps['camera']>, default: "scene"},
        items: { type: Array, default: () => [] },
        elements: { type: Object as PropType<ElementRegistry>, default: () => ({}) }
    } satisfies ComponentObjectPropsOptions<VuetrexProps>,
    emits: {
        /** Stage mounted; the inner scene tree mounts on the next Vue tick. */
        ready: (..._args: VuetrexEvents['ready']) => true,
        'scene-error': (..._args: VuetrexEvents['scene-error']) => true,
    },
    setup(props, {slots, emit}) {
        const inheritedStyles = inject(styleSheetContextKey, undefined);
        const sheets = computed(() => props.sheets ?? inheritedStyles?.sheets.value ?? []);
        const sceneScheme = computed(() => props.scheme ?? 'light');
        const sceneResolvedScheme = useResolvedColorScheme(sceneScheme);
        const resolvedScheme = computed(() => props.scheme === undefined
            ? inheritedStyles?.resolvedScheme.value ?? 'light'
            : sceneResolvedScheme.value);
        const connectorAppearances = computed(() => mergeConnectorAppearances(sheets.value, resolvedScheme.value));
        const materialStyles = computed(() => mergeStyleSheets(sheets.value, resolvedScheme.value));
        const lastError = shallowRef<VxSceneError>()
        const reportError = (error: VxSceneError) => {
            lastError.value = error
            console.error(`[Vuetrex] <${error.tag}>${error.nodeId ? ` #${error.nodeId}` : ''}${error.property ? ` property ${error.property}` : ''}: ${error.message} ${error.correction}`, error.cause)
            emit('scene-error', error)
        }
        const elRef = ref(null);
        const maxWidth = ref(4096);
        const maxHeight = ref(4096);
        let stageRoot: Root | null = null;
        let vuetrexRenderer: ReturnType<typeof createRendererForStage> | null = null;
        const vuetrexComponent = getCurrentInstance();

        if (!vuetrexComponent) {
            console.error("Vuetrex setup failed: getCurrentInstance() returned null.");
            return () => h("div", "Component misconfiguration.");
        }

        /**
         * Vuetrex utilizes its own renderer, which would typically result in the loss of Vue's `appContext`, `root`,
         * and `provides` within Vuetrex components.
         *
         * To address this, we override the component's parent, `root`, `appContext`, and `provides` before rendering
         * slot content.
         */
        const Connector = defineComponent({
            setup(_, { slots }) {
                onErrorCaptured((cause, instance, info) => {
                    reportError(sceneError(cause, instance?.$options.name ?? 'scene component', 'render'))
                    return false
                })
                const instance = getCurrentInstance();
                if (instance) {
                    // @see runtime-core createComponentInstance
                    Object.assign(instance, {
                        parent: vuetrexComponent,
                        appContext: vuetrexComponent.appContext,
                        root: vuetrexComponent.root,
                        provides: (vuetrexComponent as any).provides
                    });
                } else {
                    console.error("Vue's getCurrentInstance() returned null in Connector component. It likely means your app is misconfigured")
                }
                return () => h(Fragment, slots.default?.());
            },
        });

        onMounted(() => {
            if (!slots.default || !elRef.value) {
                console.warn("Vuetrex: No default slot defined.");
                return;
            }

            try {
                const stage = new VuetrexStage(elRef.value, {...props.settings});
                stage.materialStyles = materialStyles;
                stage.connectorAppearances = connectorAppearances;
                vuetrexRenderer = createRendererForStage(stage, props.elements, reportError);
                stageRoot = new Root(stage);

                watch(
                    // Inline :camera="{ orbit }" creates a fresh wrapper on render;
                    // only a changed value should replace the active timeline.
                    () => JSON.stringify(props.camera),
                    () => { try { stage.setCamera(props.camera) } catch (cause) { reportError(sceneError(cause, 'Vuetrex', 'prop', 'camera')) } },
                    { immediate: true }
                );
                stage.mount();
                emit("ready", stage);

                if (!props.stopped) stage.start();

                watch(
                    () => props.stopped,
                    (stopped) => (stopped ? stage.pause() : stage.unpause())
                );

                nextTick().then(() => {
                    if (stageRoot) {
                        vuetrexRenderer?.(h(Connector, slots.default), stageRoot);
                    }
                }).catch(cause => reportError(sceneError(cause, 'Vuetrex', 'render')));
            } catch (cause) { reportError(sceneError(cause, 'Vuetrex', 'mount')) }
        });

        onUnmounted(() => {
            if (stageRoot) {
                const root = stageRoot;
                try {
                    // Unmount the custom-rendered Vue tree before destroying its
                    // Three.js host so component effects and hooks cannot outlive it.
                    vuetrexRenderer?.(null, root);
                } finally {
                    stageRoot = null;
                    vuetrexRenderer = null;
                    root.destroy();
                }
            }
        });

        // There needs to be a wrapper for flexible size layouting to work with pixelRatio canvas auto-resizing.
        return () =>
            h(
                "div",
                {
                    class: "custom-renderer-wrapper",
                    style: { position: props.position === 'static' ? 'relative' : props.position,
                        height: props.height,
                        width: props.width,
                        maxWidth: maxWidth.value,
                        maxHeight: maxHeight.value },
                },
                [
                    h('div', { ref: elRef, style: { width: '100%', height: '100%' } }),
                    process.env.NODE_ENV !== 'production' && lastError.value
                        ? h('div', { role: 'alert', class: 'vuetrex-scene-error', style: {
                            position: 'absolute', inset: '12px', bottom: 'auto', zIndex: 10,
                            padding: '16px', background: '#fff3f1', color: '#651b16', border: '1px solid #d96b60',
                            borderRadius: '6px', font: '14px/1.5 system-ui', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                            maxHeight: '80%', overflow: 'auto',
                        } }, [
                            h('strong', `Scene error: <${lastError.value.tag}>${lastError.value.nodeId ? ` #${lastError.value.nodeId}` : ''}`),
                            h('div', `${lastError.value.property ? `Property: ${lastError.value.property}. ` : ''}${lastError.value.message}`),
                            h('div', lastError.value.correction),
                            h('button', { type: 'button', onClick: () => { lastError.value = undefined } }, 'Dismiss'),
                        ]) : null,
                ]
            );
    },
});
