# Workshop 4 — Postprocessing lab

Run `pnpm dev:demos` and open `/workshops/workshop4/` (also linked from the landing page).

A blank curved wall and raised platform frame a matte box, metallic cylinder, and emissive cylinder. Click any shape or its toolbar button to focus the camera; Overview fits the whole scene. The light/dark switch recreates the scene and returns to overview while preserving composer controls.

Native form controls expose every `VxComposerOptions` field. Each effect supports preset inheritance, off, default-on, and custom parameters. Select a preset to reset overrides, or use Reset composer to restore the current preset. Numeric fields accept arbitrary precision; invalid composer combinations show the validation error and retain the last valid preview. Expand Effective composer values to inspect resolved defaults and quality-dependent pixel-ratio caps. Reduced effects can suppress passes even when authored as enabled.

Built-in effects are bloom, ambient occlusion, grading, and vignette. Per-object controls expose bloom membership/gain and material values. Annotation protection is available, but this intentionally empty scene has no annotations to protect.

Controls build immutable options using `composer(options).build()`. Applications can also use `composer().bloom().grading().pass(key, factory, phase).build()` and `await stage.setComposer(plan)` to add explicit custom passes. See `docs/design/composer-and-visual-styles.md` for ordering and ownership rules. Postprocessing loads only when configured; unconfigured scenes render directly.

Validation: `pnpm exec vue-tsc --noEmit -p workshops/workshop4/tsconfig.json` and `pnpm exec vitest run test/unit/verify-composer.spec.ts`.
