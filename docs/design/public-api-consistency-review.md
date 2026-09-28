# Public API consistency review

Reviewed September 27, 2026 against the working tree, including the uncommitted composer changes.
These are design recommendations, not implemented API changes. There are 16 main items.

## Direction

Make the library self-similar through shared contracts: the same concept should use the same name,
input shape, precedence, lifecycle, and inspection pattern. Preserve domain-specific operations:
geometry distributes records, particles simulate emitters, and connectors resolve topology.
Keep immutable authoring separate from compilation and runtime ownership. Keep functional and fluent
forms equivalent, the supported Vue templates, keyed batching, custom backends, and Three.js escape hatches.

Examples below describe a possible future API, not currently callable methods. Introduce aliases and
adapters before deprecations; do not silently change existing units, precedence, or ownership.

## Recommended improvements

### 1. Complete one discoverable graph-family vocabulary — high priority

**Evidence:** [geometry](../../src/lib-components/geometry/index.ts),
[particles](../../src/lib-components/particles/index.ts), and
[connectors](../../src/lib-components/connectors/index.ts) already expose frozen functional namespaces
and fluent sources. Module factories and inspection helpers sit outside those namespaces; only connectors
expose a namespace-level `pipe`.

**Proposal:** give each domain the same supported discovery pattern: `param`, `field`, `define`,
`defineOutputs`, `join`, `pipe`, `inspect`, and `signature`, wherever semantically applicable.
Keep `geo` as a compatibility alias if `geometry` becomes the canonical spelling. Do not add meaningless
operators merely for symmetry. Existing standalone exports can remain aliases.

### 2. Publish the shared parameter and field contracts — high priority

**Evidence:** all three parameter wrappers use the same token in
[graph/parameters.ts](../../src/lib-components/graph/parameters.ts), but public names include
`parameter`, `particleParameter`, and `connectorParameter`. Geometry/connector field helpers accept
constants or callbacks; `particleField` accepts a callback only. Resolver names/default arguments differ.

**Proposal:** expose canonical `Parameter<T>`, `ParameterValues`, and a generic field contract with
domain-specific context extensions. Support the same literal/parameter/callback rules and missing-value
behavior. Keep random, time, route, and topology context fields domain-specific.

### 3. Standardize spatial values, units, and anchoring — high priority

**Evidence:** [Placement](../../src/lib-components/composition/index.ts) requires Three.js vectors and
quaternions and uses `visibility`; graph transforms accept tuples and use `visible`, `translate`,
`position`, `rotate`, or `rotation`. Camera azimuth and display-wall arc use degrees while composition
ring angles use radians. Base/center/origin anchors and layout alignment are separate concepts.

**Proposal:** publish one plain-data placement/transform descriptor, with helpers for identity defaults
and Three.js conversion. Prefer `position`, `rotation`, `scale`, and `visible`. Document angle units in
types or explicit helpers, and distinguish geometry origin from layout alignment. Retain current inputs
through adapters instead of reinterpreting numbers.

### 4. Unify stable identity and item callbacks — high priority

**Evidence:** geometry and connector `keyBy` functions take a context object;
[InstanceEncoding](../../src/lib-components/nodes/InstanceNode.ts) and composition callbacks take
`(item, index)`. Connector handles use `{ scope, key }`, spatial references use IDs/names, and Vue keys
provide a different identity layer.

**Proposal:** standardize new item callbacks around `{ item, index, key }`, with typed domain additions.
Document the separate roles of Vue key, semantic ID, record key, display name, and scope. Prefer stable
keys for persistent data; retain index fallback for explicitly ephemeral collections. Preserve the
connector handle's scope instead of collapsing every identifier into one string.

### 5. Use one presentation structure across templates and graphs — high priority

**Evidence:** connector templates use `strokeColor`, `strokeWidth`, and `routeStrategy`, while graphs use
`.stroke({ color, width })` and `.route({ strategy })`. Fixed objects have `material` and `effects`;
geometry adds `materials` and `materialEffects`; display walls add `screenStyle`.

**Proposal:** share typed nested descriptors for corresponding concepts, for example
`route`, `stroke`, `material`, and `effects`. Support named contribution/channel overrides with the same
shape for screen/frame, generated material channels, and instance emission. Keep short template props
as sugar lowered through the same resolver. Preserve screen-specific brightness and mask behavior.

### 6. Define one precedence and removal contract — high priority

**Evidence:** [stylesheets](../../src/lib-components/styling/stylesheets.ts) use different material,
connector, and composer merging functions. Materials allow `null` to clear a borrowed texture;
composer effects use `false`, `true`, and objects. Root sheets replace inherited sheets. Presets,
named styles, defaults, and explicit graph fields interact differently.

**Proposal:** publish and test a common precedence model, with explicit exceptions where necessary.
Define omitted/undefined as fall-through, false as disabling an effect, null as clearing a nullable
resource, and property removal as restoring the lower layer. Merge nested fields deliberately. Keep
stylesheet replacement and extension distinct operations. Do not replace all these states with one flag.

### 7. Separate initialization from live scene configuration — high priority

**Evidence:** [VuetrexProps/VxSettings](../../src/lib-components/root-api.d.ts) mix mount-only settings
and elements with reactive camera, scheme, sheets, and stopped. Settings overlap floor and lighting
declarations; `mirrorOpacity` and `reflection` express related controls in different directions.
`items` and `lightColor3` are documented as unused.

**Proposal:** expose a small initialization contract for renderer capabilities and registrations, and
coherent live descriptors for floor, lighting, environment, camera, and composer. State which owner wins
when declarations and imperative calls overlap. Deprecate no-op fields and adapt legacy floor settings
to one documented reflection model. Preserve immutable initialization where changing it requires recreation.

### 8. Consolidate camera commands around the existing controller — high priority

**Evidence:** root `camera`, `<vx-camera>`, `stage.camera.orbit()`, `sendCameraTo()`, and `fitToContent()`
provide overlapping entry points. The [camera timeline](../../src/lib-components/three/cameraController.ts)
can tween height/radius/azimuth but not its target, which forced Workshop 2 to animate a complete root pose.

**Proposal:** one camera descriptor and controller vocabulary for `set`, `fit`, `focus`, `to`, and
`timeline`, including a continuously animated target. Templates and root shorthand should lower to the
same controller. Preserve automatic refitting, cancellation/replacement, explicit orbit, and named focus.

### 9. Give node and camera animations the same lifecycle — medium priority

**Evidence:** [stage.animateTo](../../src/lib-components/three/stage.ts) returns void and only supports
Y/scale; camera timelines support pause, resume, seek, and kill. Workshop hinges use component-owned GSAP.

**Proposal:** a shared animation handle and timing vocabulary, with domain-specific transform targets.
Support rotation/pivots and complete placement where appropriate. Specify declarative versus imperative
ownership so a watcher cannot overwrite an animation. Keep direct GSAP interoperability and stage-clock
pause behavior; do not force a bespoke animation language on advanced users.

### 10. Make application and extension capabilities explicit — high priority

**Evidence:** public exports include `VxStage`, the broader `VuetrexStage` type, and `MeshNodeStage`;
constructors receive the broad runtime stage. `MeshNode`, `Base`, `Node`, and `StageDeclaration` are public,
but the architecture's recommended `GroupNode` extension base is not exported by the root.

**Proposal:** define a small application stage interface and documented extension contexts for fixed
meshes, containers, declarations, and backends. Export supported bases consistently. Keep raw scene
access as an explicit advanced capability, with clear borrowed-versus-owned resource rules.

### 11. Use a shared host-prop contract for types, validation, and tooling — high priority

**Evidence:** root/connector/composer declaration types and generated WebStorm metadata coexist with
hand-written state setters on shapes and containers. For example, invalid DisplayWall `shape` values
are ignored, while composer enum errors throw. Registering a custom tag does not supply prop metadata.

**Proposal:** typed prop definitions should drive normalization, defaults, removal, validation, docs,
and editor metadata. Custom elements should be able to supply the same contract. Start with existing
contracts and tests rather than inventing a large schema framework. Preserve kebab-case templates and
camelCase TypeScript. Invalid data should consistently produce actionable diagnostics.

### 12. Make extension registration scoped and reversible — medium priority

**Evidence:** `registerElement()` mutates a global map and returns void; particle and connector
registrations return unregister functions. Connector appearance registrations are snapshotted, whereas
particle factories are resolved from their registry during backend creation. `createElementConfig`
already solves compiler/runtime tag recognition without importing renderer implementations into config.

**Proposal:** use one registry convention with validation, explicit duplicate/replacement policy,
per-scene snapshots, and an idempotent unregister/dispose handle. Retain globals as convenience defaults.
Build on `createElementConfig`; do not merge build-time tag discovery with heavyweight runtime imports.

### 13. Unify diagnostics while keeping compile and runtime views distinct — medium priority

**Evidence:** geometry/connectors have graph descriptions, inspection and DOT exports; particles have
signatures and node diagnostics. Stage diagnostics are separate methods, and `scene-error` and
`composer-status` expose different event payloads.

**Proposal:** a shared diagnostic envelope with code, severity, domain, owner, property path, cause,
and correction; a common domain inspection entry point; and a stage snapshot grouped by subsystem.
Keep graph inspection pure and runtime metrics explicitly stage-bound. Preserve domain-specific counters
and deduplicated events rather than forcing one giant identical payload.

### 14. Make interaction hits a discriminated public type — medium priority

**Evidence:** [VxMouseEvent](../../src/lib-components/three/stage.ts) exposes `vxPosition: any`,
`vxNode: Node`, `vxInstance` containing instance/geometry/particle hits, and a separate `vxConnector`.

**Proposal:** expose a typed `hit` union with `kind`, stable handle, user data, and world/local position
where available; keep the original pointer event. Preserve instanced slot information and connector
path positions as specialized fields. Adapt the old `vx*` properties during migration.

### 15. Align reusable modules, outputs, and composition adapters — medium priority

**Evidence:** all graph domains have `define*` and `define*Outputs`; only connector factories take a
scope option. Named outputs reserve `output` and expose both property access and `.output(name)`.
Composition returns a SceneFragment whose connection records differ from connector sources.

**Proposal:** give graph factories the same invocation and output-access conventions, with optional
domain-specific instance options. Provide explicit adapters from composition records to renderer hosts
and connector sources so nesting a reusable module does not require bespoke plumbing. Keep multi-output
graphs, recursion limits, stable scope, and the composition recipe's selection/aggregation stages.

### 16. Organize and test the supported package surface — medium priority

**Evidence:** package exports expose only the root and `/compiler`, while the root mixes authoring,
runtime classes, compiler records, and generic names such as `field`, `filter`, and `parameter`.
Submodule types such as `GeometryNodeOptions` and composition option interfaces are not consistently
re-exported. `VxStylesheet` and `VxStyleSheet` are aliases.

**Proposal:** choose canonical names and documented authoring/runtime/extension boundaries. Consider
supported subpaths for graph domains and extensions while retaining the convenient root and existing
aliases. Add packaged-consumer contract checks for every advertised symbol, representative host props,
and framework-neutral compiler configuration. Make pure authoring imports avoid renderer initialization
where practical; keep advanced compiler/backend access through intentional entry points.

## Delivery order and compatibility

Start with the vocabulary and contracts in 1–7 and 10–11; these prevent further divergence. Introduce
camera/animation consistency next, then consolidate registries, diagnostics, interaction, modules, and
packaging as callers migrate. Each change should include an old/new example and equivalence tests.

Preserve all meaningful capabilities through aliases/adapters until a deliberate breaking release.
Only genuinely unused fields should be removed without a functional replacement. No proposal here
requires unifying rendering backends, removing functional graph APIs, or making Three.js resources
part of immutable authoring values.
