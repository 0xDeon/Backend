/**
 * Executor coverage for the treasury sweep payload (#528). The outbox is the
 * single choke point for on-chain money movement (see structural.test.ts) —
 * this pins that a treasury_sweep payload actually resolves a signer and
 * submits, rather than silently falling through the switch.
 */
import { resolveSignerPublicKey } from '../../../src/outbox/executors'

jest.mock('../../../src/db', () => ({
  __esModule: true,
  default: {
    treasuryAccount: { findFirst: jest.fn() },
    reserveSponsorship: { create: jest.fn(), updateMany: jest.fn() },
  },
}))

import db from '../../../src/db'

describe('resolveSignerPublicKey — treasury_sweep', () => {
  it('resolves to the fromTier account public key', async () => {
    ;(db.treasuryAccount.findFirst as jest.Mock).mockResolvedValue({
      publicKey: 'GHOTACCOUNT',
    })

    const key = await resolveSignerPublicKey(
      {
        method: 'treasury_sweep',
        fromTier: 'HOT',
        toTier: 'WARM',
        asset: 'XLM',
        amount: 100,
        sweepId: 'sweep-1',
      } as any,
      'SYSTEM'
    )

    expect(key).toBe('GHOTACCOUNT')
    expect(db.treasuryAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tier: 'HOT', isActive: true } })
    )
  })
})
