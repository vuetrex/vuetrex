import { connectors, particles } from '@/lib-components/index.js'

/** TabA's narrow additive streams, authored entirely with the public graph API. */
export function tabAConnectors(itemCount: number, extraRow: boolean) {
  const links = [
    ...Array.from({ length: itemCount }, (_, index) => ({ from: `a${index}`, to: 'b2' })),
    ...(itemCount ? [{ from: 'b2', to: 'a0' }] : []),
    { from: 'b3', to: 'b2' },
    { from: 'c2', to: 'b3' },
    { from: 'd1', to: 'c2' },
    ...(extraRow ? [{ from: 'e1', to: 'd1' }] : []),
  ]
  return connectors.edges(links, {
    keyBy: ({ item }) => `${item.from}:${item.to}`,
    from: ({ item }) => item.from,
    to: ({ item }) => item.to,
  })
    .route({ strategy: 'orthogonal' })
    .stroke({ opacity: 0, markerEnd: false })
    .flow(route => particles.path(route.points, {
      key: route.key,
      count: Math.max(1, Math.round(route.totalLength * 1000)),
      distribution: 'even',
      interpolation: 'linear',
      spread: 0.005 * route.scale,
    }).appearance({
      color: 0xa8f5ff,
      size: ({ random }) => (0.018 + random * 0.012) * route.scale,
      opacity: 0.28,
      shape: 'soft-disc',
      blending: 'additive',
    }).motion({ speed: 0.5 * route.scale }))
}
