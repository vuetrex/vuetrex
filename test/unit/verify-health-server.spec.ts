import { afterEach, describe, expect, it } from 'vitest'
import {
    DEPLOYMENTS,
    RELATIONS,
    catalog,
    eventsBetween,
    metricsAt,
    snapshotAt,
    validateStatePatch,
} from '../../demo-health/simulation.mjs'
import { createHealthServer } from '../../demo-health/server.mjs'

const fixtures: Array<ReturnType<typeof createHealthServer>> = []

afterEach(async () => {
    await Promise.all(fixtures.splice(0).map(fixture => fixture.close()))
})

describe('health fixture simulation', () => {
    it('provides a stable 20-deployment catalog and useful topology', () => {
        const definition = catalog()

        expect(DEPLOYMENTS).toHaveLength(20)
        expect(RELATIONS.length).toBeGreaterThan(20)
        expect(new Set(DEPLOYMENTS.map(item => item.id)).size).toBe(20)
        expect(DEPLOYMENTS.every(item => item.replicas >= 2 && item.replicas <= 3)).toBe(true)
        expect(definition.scenarios.map(item => item.id)).toEqual([
            'normal',
            'traffic-spike',
            'zone-outage',
            'memory-leak',
        ])
    })

    it('recreates identical snapshots for the same timeline position', () => {
        expect(snapshotAt(88.5, 'normal')).toEqual(snapshotAt(88.5, 'normal'))
        expect(metricsAt(170, 'traffic-spike')).toEqual(metricsAt(170, 'traffic-spike'))
    })

    it('progresses from an empty startup into a ready system', () => {
        const starting = snapshotAt(0)
        const running = snapshotAt(90)

        expect(starting.phase).toBe('starting')
        expect(starting.summary.deployments).toBe(2)
        expect(starting.summary.pods).toBe(0)
        expect(running.summary.deployments).toBe(20)
        expect(running.summary.pods).toBe(running.cluster.expectedPods)
        expect(running.summary.readyPods).toBe(running.cluster.expectedPods)
    })

    it('applies incidents without changing stable resource identities', () => {
        const baseline = snapshotAt(170, 'normal')
        const incident = snapshotAt(170, 'traffic-spike')
        const baselinePayments = baseline.deployments.find(item => item.id === 'payments-api')!
        const incidentPayments = incident.deployments.find(item => item.id === 'payments-api')!

        expect(incident.deployments.map(item => item.id)).toEqual(baseline.deployments.map(item => item.id))
        expect(incidentPayments.status).toBe('degraded')
        expect(incidentPayments.readyReplicas).toBeLessThan(incidentPayments.desiredReplicas)
        expect(incidentPayments.metrics.requestsPerSecond).toBeGreaterThan(baselinePayments.metrics.requestsPerSecond)
        expect(incidentPayments.metrics.errorRate).toBeGreaterThan(baselinePayments.metrics.errorRate)
    })

    it('returns lifecycle events in the requested half-open time range', () => {
        const events = eventsBetween(119, 166, 'traffic-spike')

        expect(events.some(event => event.reason === 'TrafficSpike')).toBe(true)
        expect(events.some(event => event.reason === 'CrashLoopBackOff')).toBe(true)
        expect(events.every(event => event.t > 119 && event.t <= 166)).toBe(true)
    })

    it('validates timeline patches as a small explicit control language', () => {
        const current = { t: 12, playing: true, rate: 1, scenario: 'normal', revision: 0 }

        expect(validateStatePatch({ t: 0, playing: false }, current)).toMatchObject({
            t: 0,
            playing: false,
            rate: 1,
            scenario: 'normal',
        })
        expect(() => validateStatePatch({ disaster: true }, current)).toThrow('unknown state field')
        expect(() => validateStatePatch({ scenario: 'meteor' }, current)).toThrow('scenario must be one of')
    })
})

describe('health fixture HTTP contract', () => {
    it('serves catalog, timeline control, snapshots, and event history', async () => {
        const fixture = createHealthServer({ port: 0, tickMs: 60_000 })
        fixtures.push(fixture)
        const address = await fixture.listen()
        if (typeof address !== 'object' || !address) throw new Error('server did not return a TCP address')
        const baseUrl = `http://127.0.0.1:${address.port}`

        const catalogResponse = await fetch(`${baseUrl}/catalog`)
        expect(catalogResponse.status).toBe(200)
        expect(catalogResponse.headers.get('access-control-allow-origin')).toBe('*')
        expect((await catalogResponse.json()).deployments).toHaveLength(20)

        const stateResponse = await fetch(`${baseUrl}/state`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ t: 170, playing: false, scenario: 'traffic-spike' }),
        })
        expect(stateResponse.status).toBe(200)
        expect((await stateResponse.json()).state).toMatchObject({
            t: 170,
            playing: false,
            scenario: 'traffic-spike',
            revision: 1,
        })

        const snapshotResponse = await fetch(`${baseUrl}/snapshot`)
        const snapshot = await snapshotResponse.json()
        expect(snapshot.t).toBe(170)
        expect(snapshot.scenario).toBe('traffic-spike')
        expect(snapshot.phase).toBe('incident')

        const eventsResponse = await fetch(`${baseUrl}/events?since=119&until=170`)
        const eventHistory = await eventsResponse.json()
        expect(eventHistory.events.some((event: { reason: string }) => event.reason === 'TrafficSpike')).toBe(true)
    })

    it('starts an SSE client with a coherent reset snapshot', async () => {
        const fixture = createHealthServer({ port: 0, tickMs: 60_000 })
        fixtures.push(fixture)
        const address = await fixture.listen()
        if (typeof address !== 'object' || !address) throw new Error('server did not return a TCP address')

        const controller = new AbortController()
        const response = await fetch(`http://127.0.0.1:${address.port}/stream`, { signal: controller.signal })
        expect(response.headers.get('content-type')).toContain('text/event-stream')

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let payload = ''
        while (!payload.includes('"snapshot"')) {
            const chunk = await reader.read()
            if (chunk.done) break
            payload += decoder.decode(chunk.value, { stream: true })
        }
        controller.abort()

        expect(payload).toContain('event: reset')
        expect(payload).toContain('"reason":"connected"')
        expect(payload).toContain('"snapshot"')
    })
})
