import { ElementNamespace, RendererOptions, VNodeProps} from 'vue';
import { Base } from '@/lib-components/nodes/Base.js';
import { Comment, TextNode } from '@/lib-components/nodes/Root.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';
import { types, ElementRegistry, FunctionalComponent, ClassComponent } from '@/lib-components/nodes/types.js';

export const nodeOps = (stage: VuetrexStage, extraTypes?: ElementRegistry): Omit<RendererOptions<Base, Base>, "patchProp"> => ({

  insert: (child, parent, anchor) => {
    if (anchor != null) {
      parent.insertBefore(child, anchor);
    } else {
      parent.appendChild(child);
    }
  },

  remove: (child) => {
    const parent = child.getHostParent();
    if (parent != null) {
      parent.removeChild(child);
    }
  },

  createElement: (tag: string, namespace?: ElementNamespace, isCustomizedBuiltIn?: string, vnodeProps?: (VNodeProps & { [key: string]: any }) | null) => {
    if (namespace) {
      console.warn(`Vuetrex: namespace '${namespace}' is not supported. Remove SVG/MathML from Vuetrex templates.`)
      return new Comment(`unsupported namespace: ${namespace}`)
    }
    const type = extraTypes?.[tag] ?? types[tag];
    if (!type) {
      console.warn(`Vuetrex nodeOps: unknown tag: ${tag}`);
      return new Comment("Unknown " + tag);
    }
    if (typeof (type as FunctionalComponent).setup === 'function') {
      return (type as FunctionalComponent).setup(stage);
    } else {
      return new (type as ClassComponent)(stage);
    }
  },

  createText: (text) => {
    return new TextNode(text);
  },

  createComment: (text) => {
    //sometimes text === 'v-if' and we should have a placeholder for VirtualDOM even when condition is false
    return new Comment(text);
  },

  setText: (node, text) => {
    // NOOP
  },

  setElementText: (node, text) => {
    node.setElementText(text);
  },

  parentNode: (node) => node.getHostParent(),

  nextSibling: (node) => node.getHostNextSibling()

});
