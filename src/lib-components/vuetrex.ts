import { createRendererForStage } from '@/lib-components/renderer.js';
import { defineComponent, Fragment, getCurrentInstance, nextTick, h, onMounted, onUnmounted, ref, PropType, watch } from 'vue';
import { Root } from '@/lib-components/nodes/Root.js';
import { VuetrexStage, VxStage as _VxStage, VxSettings as _VxSettings, VxMouseEvent as _VxMouseEvent } from '@/lib-components/three/stage.js';
import { ElementRegistry } from '@/lib-components/nodes/types.js';

export type VxStage = _VxStage;        // A ThreeJS scene rendered within a DOM element, supporting configurable camera and settings.
export type VxSettings = _VxSettings;  // Configuration options such as color schemes and material opacity.
export type VxMouseEvent = _VxMouseEvent; // Enables click translation into 3D space to identify affected elements.

/**
 * Vuetrex serves as a container that encapsulates a 3D scene.
 * It leverages Vue's Custom Renderer to provide reactivity, seamlessly integrating Vue's reactivity model into
 * a ThreeJS environment.
 *
 * @vue-prop settings {VxSettings} - Configuration settings for Vuetrex (TBD).
 * @vue-prop position {String} - The CSS position of the container div (e.g., static, absolute, relative).
 * @vue-prop play {String} - Determines if the scene animates on load ("false" keeps it static until changed).
 */
export default defineComponent({
    name: "Vuetrex",
    props: {
        settings: { type: Object as PropType<VxSettings>, default: () => ({}) },
        position: { type: String, default: "static" },
        height: { type: String, default: "50vh" },
        width: { type: String, default: "100%" },
        stopped: { type: Boolean, default: false },
        camera: {type: String, default: "scene"},
        items: { type: Array, default: () => [] },
        elements: { type: Object as PropType<ElementRegistry>, default: () => ({}) }
    },
    emits: ["ready"],
    setup(props, {slots, emit}) {
        const elRef = ref(null);
        const maxWidth = ref(4096);
        const maxHeight = ref(4096);
         let stageRoot: Root | null = null;
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

            const stage = new VuetrexStage(elRef.value, {...props.settings});
            const vuetrexRenderer = createRendererForStage(stage, props.elements);
            stageRoot = new Root(stage);

            stage.mount();
            emit("ready", stage);

            if (!props.stopped) stage.start();

            watch(
                () => props.stopped,
                (stopped) => (stopped ? stage.pause() : stage.unpause())
            );

            watch(
                () => props.camera,
                (camera) => stage.sendCameraTo(camera),
                { immediate: true }
            );

            nextTick().then(() => {
                if (stageRoot) {
                    vuetrexRenderer(h(Connector, slots.default), stageRoot);
                }
            });
        });

        onUnmounted(() => {
            if (stageRoot) {
                stageRoot.destroy();
                stageRoot = null;
            }
        });

        // There needs to be a wrapper for flexible size layouting to work with pixelRatio canvas auto-resizing.
        return () =>
            h(
                "div",
                {
                    class: "custom-renderer-wrapper",
                    style: { position: props.position,
                        height: props.height,
                        width: props.width,
                        maxWidth: maxWidth.value,
                        maxHeight: maxHeight.value },
                    ref: elRef
                }
            );
    },
});
