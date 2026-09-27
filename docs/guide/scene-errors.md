---
title: Scene errors
description: Diagnose invalid scene declarations and observe failures in your application.
---

# Scene errors

A failed scene declaration should identify its source rather than leave an unexplained
empty canvas. Vuetrex reports failures through `@scene-error` and `console.error` in
both development and production. Development builds also show a dismissible panel
inside the scene container, separate from the WebGL canvas.

```vue
<script setup lang="ts">
import { Vuetrex, type VxSceneError } from '@exceeder/vuetrex'
function onSceneError(error: VxSceneError) {
  // Show your own application feedback or send to your error reporting service.
  console.log(error.tag, error.nodeId, error.property, error.correction)
}
</script>

<template>
  <Vuetrex @scene-error="onSceneError">
    <vx-floor :fade-start="10" :fade-end="20" />
  </Vuetrex>
</template>
```

For example, `fade-end="5"` with `fade-start="10"` reports `vx-floor`, the fade
properties, and the constraint `0 <= fadeStart < fadeEnd`. An invalid numeric
`reflection` identifies that property and asks for finite numeric data. Unknown tags
point to runtime registration and shared compiler configuration.

| Field | Meaning |
| --- | --- |
| `tag` | Renderer tag, component name, or `Vuetrex` for initialization failures |
| `nodeId` | Authored ID/name when available |
| `property` | Exact prop for setter failures; inferred from validation messages for reactive failures, omitted when unknown |
| `phase` | `create`, `prop`, `insert`, `sync`, `effect`, `mount`, or `render` |
| `message` | Original error message |
| `correction` | Suggested correction or validation constraint |
| `cause` | Original thrown value, preserving Error stack/details |

Rejected prop setters retain the prior value when validation happens before assignment.
Reactive declaration constraints are checked after the Vue flush, so paired props can
change together. Updating an invalid binding can recover the declaration. Unknown tags
or failed construction are placeholders; fix registration and remount that element.
Insertion or initialization failures may also need a remount. There is no automatic
retry loop or promise of transactionally rolling back partially completed custom code.

Healthy siblings can continue rendering. Repeated identical failures from the same
operation are suppressed until it succeeds. The development panel displays the latest
reported failure and remains until dismissed; dismissing does not fix or retry it.
Production applications receive the same event but should supply their own UI.

Built-in reactive scene effects and renderer operations retain host context. Errors in
Vue scene components are reported through the component error boundary. Arbitrary
application timers, external promises, or custom effects outside these boundaries
remain the application's responsibility. Direct low-level calls without a reporting
boundary retain their throwing behavior. This reporting does not add validation to
properties that previously had none.

Bundlers should replace `process.env.NODE_ENV` as usual: the development panel is
excluded when it is `production`, while the event and console diagnostics remain.
