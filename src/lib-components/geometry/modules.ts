import { createGeometryNode, isGeometrySource } from '@/lib-components/geometry/graph.js'
import type { GeometryFactory, GeometrySource } from '@/lib-components/geometry/types.js'

const MAX_CONSTRUCTION_DEPTH = 128
let moduleSequence = 0

export function defineGeometry<Parameters, Item = unknown>(
    build: (parameters: Readonly<Parameters>) => GeometrySource<Item>,
): GeometryFactory<Parameters, Item>
export function defineGeometry<Parameters, Item = unknown>(
    name: string,
    build: (parameters: Readonly<Parameters>) => GeometrySource<Item>,
): GeometryFactory<Parameters, Item>
export function defineGeometry<Parameters, Item = unknown>(
    nameOrBuild: string | ((parameters: Readonly<Parameters>) => GeometrySource<Item>),
    maybeBuild?: (parameters: Readonly<Parameters>) => GeometrySource<Item>,
): GeometryFactory<Parameters, Item> {
    const build = typeof nameOrBuild === 'function' ? nameOrBuild : maybeBuild
    if (!build) throw new TypeError('defineGeometry() requires a builder function.')
    const moduleName = typeof nameOrBuild === 'string'
        ? nameOrBuild
        : build.name || `geometry-module-${++moduleSequence}`
    let constructionDepth = 0

    const factory = ((parameters: Readonly<Parameters>) => {
        constructionDepth++
        if (constructionDepth > MAX_CONSTRUCTION_DEPTH) {
            constructionDepth--
            throw new Error(
                `Geometry module '${moduleName}' exceeded ${MAX_CONSTRUCTION_DEPTH} nested calls. `
                + 'Recursive geometry factories must terminate with a finite depth.',
            )
        }
        try {
            const source = build(parameters)
            if (!isGeometrySource(source)) {
                throw new TypeError(`Geometry module '${moduleName}' did not return a GeometrySource.`)
            }
            return createGeometryNode(
                'module',
                { geometry: source },
                { name: moduleName },
                moduleName,
            )
        } finally {
            constructionDepth--
        }
    }) as GeometryFactory<Parameters, Item>

    Object.defineProperty(factory, 'geometryModuleName', {
        value: moduleName,
        enumerable: true,
    })
    return factory
}
