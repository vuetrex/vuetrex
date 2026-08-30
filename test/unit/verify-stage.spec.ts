import Vuetrex from '@/lib-components/vuetrex.js'
import { shallowMount } from '@vue/test-utils'
import { describe, it, expect} from 'vitest'
import { createRendererForStage } from '@/lib-components/renderer.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';

describe('The Vuetrex Stage object', () => {

    it("should create a renderer for the given stage", () => {
        const mockStage = null as any
        const render = createRendererForStage(mockStage, {})
        expect(typeof render).toBe('function')
    })

    it('should be able to mount Stage', function() {
        // @ts-ignore
        const wrapper = shallowMount(Vuetrex,{
            propsData: {
                camera: "camera"
            }
        });
        expect(wrapper).toBeDefined();
        expect(wrapper.vm.camera).toBe("camera");
    })

    it('paints the floor grid with an explicit color when there are no captions', () => {
        const fillColors: string[] = []
        const texture = {
            fillStyle: '',
            context: {
                font: '',
                measureText: () => ({ width: 0 }),
            },
            clear(fillStyle?: string) {
                if (fillStyle !== undefined) this.fillStyle = fillStyle
                return this
            },
            drawText() { return this },
            setGlobalAlpha() {},
            fillRect() { fillColors.push(this.fillStyle) },
        }
        const stage = Object.create(VuetrexStage.prototype) as VuetrexStage
        Object.assign(stage as any, {
            settings: { floorColor: 0x171b1d, captionColor: 0xe8ecee, mirrorOpacity: 0.76 },
            boxRadius: 1,
            captions: [],
            caps: { size: 2048, repeats: 17, texture },
        })

        stage.repaintTitles(256)

        expect(fillColors).toHaveLength(240)
        expect(new Set(fillColors)).toEqual(new Set(['#e8ecee']))
    })
})
