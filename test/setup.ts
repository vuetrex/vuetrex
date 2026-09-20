import { config } from '@vue/test-utils'

// Match the isCustomElement rule already defined in vite.config.mts for the
// SFC compiler. This covers runtime-compiled templates (inline template strings
// in test fixtures) which bypass the Vite plugin's SFC compiler pass.
config.global.config.compilerOptions = {
    isCustomElement: (tag: string) => /^vx-(group|layer|row|stack|ring|panel|instances|box|cylinder|wedge|connectors|environment|camera|floor)$/.test(tag)
}
