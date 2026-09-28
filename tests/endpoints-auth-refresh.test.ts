/**
 * HTTP-level coverage for the refresh endpoint (#472).
 *
 * `refresh` was implemented in the controller but never mounted, so the entire
 * rotation design was unreachable in production — clients could obtain a refresh
 * token from /auth/verify and had no way to use it. These tests exercise the real
 * router, the real validator and the real service against a stubbed database, so
 * a missing mount or a mis-sized status code fails here.
 */

const mockSessionFindFirst = jest.fn()
const mockSessionFindUnique = jest.fn()
const mockSessionUpdate = jest.fn()
const mockSessionUpdateMany = jest.fn()

jest.mock('../src/db', () => ({
  __esModule: true,
  default: {
    session: {
      findFirst: (...args: unknown[]) => mockSessionFindFirst(...args),
      findUnique: (...args: unknown[]) => mockSessionFindUnique(...args),
      update: (...args: unknown[]) => mockSessionUpdate(...args),
      updateMany: (...args: unknown[]) => mockSessionUpdateMany(...args),
    },
  },
}))

jest.mock('../src/ws/server', () => ({
  closeUserSockets: jest.fn(() => 0),
}))

jest.mock('../src/events/publisher', () => ({
  publishUserEvent: jest.fn(() => Promise.resolve()),
}))

import request from 'supertest'
import app from '../src/index'
import { deriveRefreshTokenPrefix } from '../src/services/refresh-token.service'

/** A session row that can actually be exchanged. */
function liveSession(raw: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: mockHash,
    refreshTokenPrefix: deriveRefreshTokenPrefix(raw),
    refreshTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    refreshTokenUsedAt: null,
    refreshTokenRotations: 0,
    expiresAt: new Date(Date.now() - 60 * 1000), // access token already expired
    revokedAt: null,
    deviceType: 'browser',
    approxLocation: 'Unknown',
    user: { id: 'user-1', isActive: true },
    ...overrides,
  }
}

let mockHash = ''

beforeAll(async () => {
  const bcrypt = await import('bcryptjs')
  mockHash = await bcrypt.default.hash('live-refresh-token', 4)
})

beforeEach(() => {
  jest.clearAllMocks()
  mockSessionUpdate.mockResolvedValue({})
  mockSessionUpdateMany.mockResolvedValue({ count: 1 })
})

describe('POST /api/v1/auth/refresh', () => {
  it('is mounted and returns a rotated pair for a valid token', async () => {
    mockSessionFindFirst.mockResolvedValue(liveSession('live-refresh-token'))

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'live-refresh-token' })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeTruthy()
    expect(res.body.refreshToken).toBeTruthy()
    expect(res.body.refreshToken).not.toBe('live-refresh-token')
    expect(res.body.expiresAt).toBeDefined()
    expect(res.body.refreshExpiresAt).toBeDefined()
  })

  it('is also reachable on the deprecated unversioned path', async () => {
    mockSessionFindFirst.mockResolvedValue(liveSession('live-refresh-token'))

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'live-refresh-token' })

    expect(res.status).toBe(200)
  })

  it('rejects a request with no refreshToken', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({})

    expect(res.status).toBe(400)
  })

  it('rejects a non-string refreshToken', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: { $ne: null } })

    expect(res.status).toBe(400)
  })

  it('rejects an absurdly long refreshToken before hashing it', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'a'.repeat(5000) })

    expect(res.status).toBe(400)
    expect(mockSessionFindFirst).not.toHaveBeenCalled()
  })

  it('returns 401 for an unknown token', async () => {
    mockSessionFindFirst.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'never-issued' })

    expect(res.status).toBe(401)
  })

  it('returns 401 without revealing that a replay was detected', async () => {
    mockSessionFindFirst.mockResolvedValue(
      liveSession('live-refresh-token', { refreshTokenUsedAt: new Date() })
    )

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'live-refresh-token' })

    expect(res.status).toBe(401)
    // A distinct "reuse detected" string would confirm the token is real.
    expect(res.body.error).toBe('Invalid or expired refresh token')
  })

  it('revokes the session when a replayed token is presented', async () => {
    mockSessionFindFirst.mockResolvedValue(
      liveSession('live-refresh-token', { refreshTokenUsedAt: new Date() })
    )

    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'live-refresh-token' })

    expect(mockSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          revokedReason: 'refresh_token_reuse',
        }),
      })
    )
  })

  it('returns 409 when two refreshes with one token race', async () => {
    mockSessionFindFirst.mockResolvedValue(liveSession('live-refresh-token'))
    mockSessionUpdateMany.mockResolvedValue({ count: 0 })
    mockSessionFindUnique.mockResolvedValue({
      id: 'session-1',
      refreshTokenUsedAt: null,
    })

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'live-refresh-token' })

    expect(res.status).toBe(409)
  })
})
