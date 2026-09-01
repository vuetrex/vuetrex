import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
    SCENARIOS,
    catalog,
    eventsBetween,
    metricsAt,
    snapshotAt,
    validateStatePatch,
} from './simulation.mjs'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4100
const MAX_BODY_BYTES = 64 * 1024

const routes = {
    'GET /healthz': 'Liveness and current simulation time.',
    'GET /catalog': 'Static deployment definitions, topology, and available scenarios.',
    'GET /state': 'Current timeline controls.',
    'PUT /state': 'Patch timeline controls with {t, playing, rate, scenario}.',
    'GET /snapshot': 'Complete deterministic system snapshot at the current time.',
    'GET /events?since=-1&until=<current>': 'Deterministic event history for a time range.',
    'GET /stream/events': 'Server-Sent Events containing reset, state, and lifecycle events.',
    'GET /stream/metrics': 'Server-Sent Events containing metric samples.',
    'GET /stream': 'Combined Server-Sent Events stream.',
}

const json = (response, status, body) => {
    const payload = JSON.stringify(body, null, 2)
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(payload),
    })
    response.end(payload)
}

const readJson = request => new Promise((resolveBody, reject) => {
    let body = ''
    let size = 0
    request.setEncoding('utf8')
    request.on('data', chunk => {
        size += Buffer.byteLength(chunk)
        if (size > MAX_BODY_BYTES) {
            reject(Object.assign(new Error('request body exceeds 64 KiB'), { statusCode: 413 }))
            request.destroy()
            return
        }
        body += chunk
    })
    request.on('end', () => {
        if (!body.trim()) {
            reject(Object.assign(new Error('request body must contain JSON'), { statusCode: 400 }))
            return
        }
        try {
            resolveBody(JSON.parse(body))
        } catch {
            reject(Object.assign(new Error('request body is not valid JSON'), { statusCode: 400 }))
        }
    })
    request.on('error', reject)
})

const writeSse = (response, event, body, id) => {
    if (id !== undefined) response.write(`id: ${id}\n`)
    response.write(`event: ${event}\n`)
    response.write(`data: ${JSON.stringify(body)}\n\n`)
}

export function createHealthServer(options = {}) {
    const host = options.host ?? DEFAULT_HOST
    const port = options.port ?? DEFAULT_PORT
    const tickMs = options.tickMs ?? 1000
    const clients = {
        combined: new Set(),
        events: new Set(),
        metrics: new Set(),
    }
    const state = {
        t: 0,
        playing: true,
        rate: 1,
        scenario: 'normal',
        revision: 0,
    }
    let lastTickAt = Date.now()
    let interval

    const publicState = () => ({
        ...state,
        availableScenarios: SCENARIOS,
    })

    const broadcast = (channel, event, body, id) => {
        for (const response of clients[channel]) writeSse(response, event, body, id)
    }

    const broadcastState = () => {
        const current = publicState()
        broadcast('events', 'state', current)
        broadcast('combined', 'state', current)
    }

    const broadcastReset = reason => {
        const reset = {
            reason,
            state: publicState(),
            snapshot: snapshotAt(state.t, state.scenario),
        }
        broadcast('events', 'reset', reset)
        broadcast('combined', 'reset', reset)
        const metrics = metricsAt(state.t, state.scenario)
        broadcast('metrics', 'metrics', metrics, `metrics-${state.revision}-${state.t}`)
        broadcast('combined', 'metrics', metrics, `metrics-${state.revision}-${state.t}`)
    }

    const advance = elapsedSeconds => {
        if (!state.playing) return
        const previous = state.t
        state.t = Number((state.t + elapsedSeconds * state.rate).toFixed(3))
        for (const event of eventsBetween(previous, state.t, state.scenario)) {
            broadcast('events', 'event', event, event.id)
            broadcast('combined', 'event', event, event.id)
        }
        const metrics = metricsAt(state.t, state.scenario)
        const metricId = `metrics-${state.revision}-${state.t}`
        broadcast('metrics', 'metrics', metrics, metricId)
        broadcast('combined', 'metrics', metrics, metricId)
    }

    const tick = () => {
        const now = Date.now()
        const elapsedSeconds = (now - lastTickAt) / 1000
        lastTickAt = now
        advance(elapsedSeconds)
    }

    const openStream = (request, response, channel) => {
        response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
            'x-accel-buffering': 'no',
        })
        response.write('retry: 1500\n\n')
        clients[channel].add(response)

        if (channel === 'metrics') {
            writeSse(response, 'metrics', metricsAt(state.t, state.scenario), `metrics-${state.revision}-${state.t}`)
        } else {
            writeSse(response, 'reset', {
                reason: 'connected',
                state: publicState(),
                snapshot: snapshotAt(state.t, state.scenario),
            })
        }

        request.on('close', () => clients[channel].delete(response))
    }

    const handler = async (request, response) => {
        response.setHeader('access-control-allow-origin', '*')
        response.setHeader('access-control-allow-methods', 'GET, PUT, OPTIONS')
        response.setHeader('access-control-allow-headers', 'content-type, last-event-id')

        if (request.method === 'OPTIONS') {
            response.writeHead(204)
            response.end()
            return
        }

        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`)
        const key = `${request.method} ${url.pathname}`

        try {
            if (key === 'GET /') {
                json(response, 200, {
                    name: 'Vuetrex deterministic health fixture',
                    schemaVersion: 1,
                    routes,
                    quickStart: {
                        rewind: { method: 'PUT', path: '/state', body: { t: 0, playing: true } },
                        seekIncident: { method: 'PUT', path: '/state', body: { t: 120, scenario: 'traffic-spike' } },
                    },
                })
                return
            }

            if (key === 'GET /healthz') {
                json(response, 200, { status: 'ok', t: state.t, scenario: state.scenario })
                return
            }

            if (key === 'GET /catalog') {
                json(response, 200, catalog())
                return
            }

            if (key === 'GET /state') {
                json(response, 200, publicState())
                return
            }

            if (key === 'PUT /state') {
                const body = await readJson(request)
                const previous = { ...state }
                const next = validateStatePatch(body, state)
                Object.assign(state, next)
                const discontinuity = state.t !== previous.t || state.scenario !== previous.scenario
                if (discontinuity) state.revision++
                lastTickAt = Date.now()

                if (discontinuity) broadcastReset('timeline-changed')
                else broadcastState()

                json(response, 200, {
                    state: publicState(),
                    summary: snapshotAt(state.t, state.scenario).summary,
                })
                return
            }

            if (key === 'GET /snapshot') {
                json(response, 200, snapshotAt(state.t, state.scenario))
                return
            }

            if (key === 'GET /events') {
                const since = url.searchParams.has('since') ? Number(url.searchParams.get('since')) : -1
                const until = url.searchParams.has('until') ? Number(url.searchParams.get('until')) : state.t
                if (!Number.isFinite(since) || !Number.isFinite(until) || until < since) {
                    json(response, 400, { error: 'since and until must be finite numbers with until >= since' })
                    return
                }
                json(response, 200, {
                    fromExclusive: since,
                    toInclusive: until,
                    scenario: state.scenario,
                    events: eventsBetween(since, until, state.scenario),
                })
                return
            }

            if (key === 'GET /stream/events') {
                openStream(request, response, 'events')
                return
            }

            if (key === 'GET /stream/metrics') {
                openStream(request, response, 'metrics')
                return
            }

            if (key === 'GET /stream') {
                openStream(request, response, 'combined')
                return
            }

            json(response, 404, { error: 'route not found', routes })
        } catch (error) {
            const status = error.statusCode ?? (error instanceof TypeError || error instanceof RangeError ? 400 : 500)
            json(response, status, { error: error.message })
        }
    }

    const server = createServer(handler)

    return {
        state,
        server,
        advance,
        listen() {
            return new Promise((resolveListen, reject) => {
                server.once('error', reject)
                server.listen(port, host, () => {
                    server.off('error', reject)
                    lastTickAt = Date.now()
                    interval = setInterval(tick, tickMs)
                    interval.unref()
                    resolveListen(server.address())
                })
            })
        },
        close() {
            if (interval) clearInterval(interval)
            for (const group of Object.values(clients)) {
                for (const response of group) response.end()
                group.clear()
            }
            return new Promise((resolveClose, reject) => {
                if (!server.listening) {
                    resolveClose()
                    return
                }
                server.close(error => error ? reject(error) : resolveClose())
            })
        },
    }
}

const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isEntryPoint) {
    const port = Number(process.env.HEALTH_PORT ?? DEFAULT_PORT)
    const host = process.env.HEALTH_HOST ?? DEFAULT_HOST
    const fixture = createHealthServer({ host, port })
    const address = await fixture.listen()
    const actualPort = typeof address === 'object' && address ? address.port : port
    console.log(`Vuetrex health fixture listening on http://${host}:${actualPort}`)

    const shutdown = async () => {
        await fixture.close()
        process.exit(0)
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
}

