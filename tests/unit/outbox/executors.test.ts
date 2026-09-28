const mockDepositForUser = jest.fn() as jest.Mock
const mockWithdrawForUser = jest.fn() as jest.Mock
const mockTriggerRebalance = jest.fn() as jest.Mock
const mockPayReferralReward = jest.fn() as jest.Mock

jest.mock('../../../src/stellar/contract', () => ({
  depositForUser: (...args: any[]) => mockDepositForUser(...args),
  withdrawForUser: (...args: any[]) => mockWithdrawForUser(...args),
  triggerRebalance: (...args: any[]) => mockTriggerRebalance(...args),
  payReferralReward: (...args: any[]) => mockPayReferralReward(...args),
}))

jest.mock('../../../src/stellar/wallet', () => ({
  getWalletByUserId: jest.fn(),
}))

jest.mock('../../../src/stellar/client', () => ({
  getAgentKeypair: () => ({ publicKey: () => 'GAGENT' }),
}))

import { executeOutboxPayload } from '../../../src/outbox/executors'

const onSubmitted = jest.fn().mockResolvedValue(undefined)

beforeEach(() => {
  jest.clearAllMocks()
})

describe('executeOutboxPayload', () => {
  it('forwards the persistence callback to deposit submission', async () => {
    mockDepositForUser.mockResolvedValue({
      hash: 'deposit-hash',
      status: 'success',
    })

    await executeOutboxPayload(
      {
        method: 'deposit',
        userId: 'user-1',
        userAddress: 'GUSER',
        amount: 10,
        assetSymbol: 'USDC',
        transactionId: 'transaction-1',
      },
      2,
      onSubmitted
    )

    expect(mockDepositForUser).toHaveBeenCalledWith(
      'user-1',
      'GUSER',
      10,
      'USDC',
      2,
      onSubmitted
    )
  })

  it('forwards the persistence callback to withdrawal submission', async () => {
    mockWithdrawForUser.mockResolvedValue({
      hash: 'withdraw-hash',
      status: 'success',
    })

    await executeOutboxPayload(
      {
        method: 'withdraw',
        userId: 'user-1',
        userAddress: 'GUSER',
        amount: 10,
        assetSymbol: 'USDC',
        transactionId: 'transaction-1',
      },
      1,
      onSubmitted
    )

    expect(mockWithdrawForUser).toHaveBeenCalledWith(
      'user-1',
      'GUSER',
      10,
      'USDC',
      1,
      onSubmitted
    )
  })

  it('forwards the persistence callback to rebalance submission', async () => {
    mockTriggerRebalance.mockResolvedValue({
      hash: 'rebalance-hash',
      status: 'success',
    })

    await executeOutboxPayload(
      {
        method: 'rebalance',
        toProtocol: 'Blend',
        expectedApyBasisPoints: 500,
        transactionId: 'transaction-1',
      },
      1,
      onSubmitted
    )

    expect(mockTriggerRebalance).toHaveBeenCalledWith(
      'Blend',
      500,
      1,
      onSubmitted
    )
  })

  it('forwards the persistence callback to referral reward submission', async () => {
    mockPayReferralReward.mockResolvedValue({
      hash: 'reward-hash',
      status: 'success',
    })

    await executeOutboxPayload(
      {
        method: 'referral_reward',
        transactionId: 'transaction-1',
        recipientAddress: 'GUSER',
        amount: 10,
        assetSymbol: 'USDC',
        conversionId: 'conversion-1',
        leg: 'owner',
      },
      1,
      onSubmitted
    )

    expect(mockPayReferralReward).toHaveBeenCalledWith(
      'GUSER',
      10,
      'USDC',
      1,
      onSubmitted
    )
  })
})
