---
title: Scene notebook
description: Small, playable worlds built with procedural geometry and Vue reactivity.
---

# Scene notebook

Small worlds, ordinary Vue code. This collection explores what happens when a few geometry primitives meet reactive
state: streets that come alive, structures that grow, and patterns that change as you play.

Each entry is both a working example and a short walkthrough. Try the controls first, switch to **Source**, then
follow the idea from data to geometry. These are intentionally small experiments, not complete simulation engines.

## 01 · A block in motion

![Isometric sketch of six box-built buildings beside a loop road with toy cars.](/images/city-block.svg)

Six buildings. One looping street. A handful of toy cars.

Change the skyline, fill the road, or pause everything to inspect the scene. The model uses boxes throughout; its
variety comes from distribution, color, scale, and a little time.

**[Build a reactive city block →](/examples/city-block)**

*Explores: procedural geometry · keyed instances · parameter binding · animation lifecycle*

## What comes next?

A tree-growth experiment is a possible next entry: the same separation of recipe and reactive state, applied to
branches instead of streets. It is not implemented yet. New entries will live here without expanding the API guide.

::: tip New to Vuetrex?
Start with [installation and Vue configuration](/guide/). Every notebook entry uses the actual public
`@exceeder/vuetrex` package, not a substitute canvas renderer.
:::
