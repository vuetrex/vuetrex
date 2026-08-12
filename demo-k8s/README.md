# Intelligent transit Kubernetes demo

This standalone Vue app uses Vuetrex's current built-in nodes to visualize a smart-city traffic and public-transit control plane. The scene loosely models municipal ingress, Kafka telemetry streams, real-time routing intelligence, spatial caching, operational data, and observability services.

From the repository root:

```sh
pnpm dev
```

Then open <http://localhost:5173/demo-k8s/>.

The scene is intentionally data-driven. Workload health, replica count, event throughput, latency, and database load are reactive model fields in `App.vue`. The **Telemetry surge** button demonstrates the update path intended for the next-phase cluster event emulator. Select a 3D resource to focus the camera and open its metric inspector.

Implementation constraints and proposed Vuetrex extensions are recorded in [VUETREX_GAPS.md](./VUETREX_GAPS.md).
