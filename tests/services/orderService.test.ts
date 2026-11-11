// tests/services/orderService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock heavy I/O dependencies ────────────────────────────────────────────────
vi.mock('@/server/db', () => ({ prisma: { $transaction: vi.fn(), order: {}, checklistVersion: {}, payment: {}, orderEvent: {}, fitConfirmation: {}, message: {}, photo: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() } } }))
vi.mock('@/server/events', () => ({ appendOrderEvent: vi.fn() }))
vi.mock('@/server/paypal/orders', () => ({ createAuthorizeOrder: vi.fn(), authorizeOrder: vi.fn() }))
vi.mock('@/server/paypal/authorizations', () => ({ captureAuthorization: vi.fn(), voidAuthorization: vi.fn(), reauthorizeAuthorization: vi.fn() }))
vi.mock('@/server/ai/checklist', () => ({ buildChecklist: vi.fn() }))
vi.mock('@/server/ai/change', () => ({ writeChange: vi.fn() }))
vi.mock('@/server/ai/verify', () => ({ verifyPhotos: vi.fn() }))
vi.mock('@/server/ai/receipt', () => ({ writeReceipt: vi.fn() }))
vi.mock('@/server/ai/images', () => ({ prepareImage: vi.fn(async () => 'AQID') }))
vi.mock('@/server/storage/supabase', () => ({ uploadPhoto: vi.fn().mockResolvedValue(undefined), downloadPhoto: vi.fn().mockResolvedValue(Buffer.from('fake')) }))

import { prisma } from '@/server/db'
import { appendOrderEvent } from '@/server/events'
import { captureAuthorization, voidAuthorization } from '@/server/paypal/authorizations'
import { verifyPhotos } from '@/server/ai/verify'
import { writeReceipt } from '@/server/ai/receipt'
import { uploadPhoto, downloadPhoto } from '@/server/storage/supabase'
import {
  createOrder,
  acceptChecklist,
  acceptChange,
  submitPhotos,
  recheckPhotos,
  resolveFailedChecks,
  release,
  cancelOrder,
  reportProblem,
  getOrderEvents,
  ForbiddenError,
  InvalidTransitionError,
  GateBlockedError,
} from '@/server/services/orderService'

// ── Shared test fixtures ───────────────────────────────────────────────────────

const TAILOR_ID = 'tailor-1'
const CUSTOMER_ID = 'customer-1'
const ORDER_ID = 'order-1'
const VERSION_ID = 'cv-1'

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    customerId: CUSTOMER_ID,
    tailorId: TAILOR_ID,
    state: 'PROPOSED',
    totalCents: 5000,
    discountBps: 0,
    discountApplied: false,
    deadlineDays: null,
    checkRound: 0,
    acceptAnyway: false,
    needsManualReview: false,
    ...overrides,
  }
}

function makeCV(overrides: Record<string, unknown> = {}) {
  return {
    id: VERSION_ID,
    orderId: ORDER_ID,
    version: 1,
    tailorAcceptedAt: null,
    customerAcceptedAt: null,
    items: [{ id: 'item-1', label_en: 'Test item', checkMethod: 'photo' }],
    ...overrides,
  }
}

// Sets up prisma.$transaction to execute the callback with a mock tx
function mockTransaction(txOverrides: Record<string, unknown> = {}) {
  const tx = {
    order: { findUniqueOrThrow: vi.fn(), update: vi.fn(), create: vi.fn() },
    checklistVersion: { update: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn() },
    payment: { update: vi.fn(), create: vi.fn() },
    message: { create: vi.fn() },
    fitConfirmation: { upsert: vi.fn() },
    photo: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    ...txOverrides,
  }
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) =>
    typeof fn === 'function' ? fn(tx) : fn,
  )
  return tx
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ── assertParty (via public functions) ────────────────────────────────────────

describe('assertParty', () => {
  it('throws ForbiddenError when wrong user calls tailor-only function', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeOrder())

    await expect(submitPhotos(ORDER_ID, CUSTOMER_ID, [])).rejects.toThrow(ForbiddenError)
  })

  it('throws ForbiddenError when wrong user calls customer-only function', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeOrder({ state: 'CHECK_FAILED', checkRound: 2 }))

    await expect(resolveFailedChecks(ORDER_ID, TAILOR_ID, 'ACCEPT_ANYWAY')).rejects.toThrow(ForbiddenError)
  })
})

// ── createOrder ────────────────────────────────────────────────────────────────

describe('createOrder', () => {
  it('happy path: creates order in DRAFT and returns orderId', async () => {
    const createdOrder = { id: ORDER_ID }
    const tx = mockTransaction()
    tx.order.create = vi.fn().mockResolvedValue(createdOrder)
    tx.message.create = vi.fn().mockResolvedValue({})

    const result = await createOrder(CUSTOMER_ID, TAILOR_ID, 'I need a dress')

    expect(result).toEqual({ orderId: ORDER_ID })
    expect(tx.order.create).toHaveBeenCalledWith({
      data: { customerId: CUSTOMER_ID, tailorId: TAILOR_ID, state: 'DRAFT' },
    })
    expect(appendOrderEvent).toHaveBeenCalledWith(tx, expect.objectContaining({ toState: 'DRAFT', type: 'ORDER_CREATED' }))
  })
})

// ── acceptChecklist ────────────────────────────────────────────────────────────

describe('acceptChecklist', () => {
  it('first acceptance (tailor only): records tailorAcceptedAt, agreed=false', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeOrder())
    vi.mocked(prisma.checklistVersion as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeCV())
    vi.mocked(prisma.checklistVersion as never as { findFirst: ReturnType<typeof vi.fn> }).findFirst =
      vi.fn().mockResolvedValue(makeCV()) // latest === versionId

    const tx = mockTransaction()
    tx.checklistVersion.update = vi.fn().mockResolvedValue({})
    // After tailor accepts, customerAcceptedAt still null → agreed = false
    tx.checklistVersion.findUniqueOrThrow = vi.fn().mockResolvedValue(
      makeCV({ tailorAcceptedAt: new Date(), customerAcceptedAt: null }),
    )

    const result = await acceptChecklist(ORDER_ID, VERSION_ID, TAILOR_ID)

    expect(result).toEqual({ agreed: false })
    expect(tx.checklistVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tailorAcceptedAt: expect.any(Date) }) }),
    )
  })

  it('second acceptance: both sides accepted, PROPOSED→AGREED transition written', async () => {
    // Tailor already accepted; customer now accepts
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeOrder())
    vi.mocked(prisma.checklistVersion as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeCV({ tailorAcceptedAt: new Date() }))
    vi.mocked(prisma.checklistVersion as never as { findFirst: ReturnType<typeof vi.fn> }).findFirst =
      vi.fn().mockResolvedValue(makeCV({ tailorAcceptedAt: new Date() }))

    const tx = mockTransaction()
    tx.checklistVersion.update = vi.fn().mockResolvedValue({})
    tx.checklistVersion.findUniqueOrThrow = vi.fn().mockResolvedValue(
      makeCV({ tailorAcceptedAt: new Date(), customerAcceptedAt: new Date() }),
    )
    tx.order.findUniqueOrThrow = vi.fn().mockResolvedValue(makeOrder())
    tx.order.update = vi.fn().mockResolvedValue({})

    const result = await acceptChecklist(ORDER_ID, VERSION_ID, CUSTOMER_ID)

    expect(result).toEqual({ agreed: true })
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'AGREED' }) }),
    )
  })

  it('throws InvalidTransitionError when order is not in PROPOSED or AGREED', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeOrder({ state: 'DRAFT' }))

    await expect(acceptChecklist(ORDER_ID, VERSION_ID, TAILOR_ID)).rejects.toThrow(InvalidTransitionError)
  })
})

// ── submitPhotos ───────────────────────────────────────────────────────────────

describe('submitPhotos', () => {
  // submitPhotos asserts the transition TO SUBMITTED, so the order must be IN_PROGRESS
  // (first submit) or CHECK_FAILED with checkRound < 2 (re-upload).
  function setupSubmitOrder(state = 'IN_PROGRESS', checkRound = 0) {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue({
        ...makeOrder({ state, checkRound }),
        checklistVersions: [makeCV()],
      })
  }

  it('PHOTOS_REJECTED_UNRELATED: returns rejected, no state change, no round increment', async () => {
    setupSubmitOrder()
    vi.mocked(verifyPhotos).mockResolvedValue({
      status: 'PHOTOS_REJECTED_UNRELATED',
      reasons: ['photo shows a car'],
    })
    mockTransaction()

    const result = await submitPhotos(ORDER_ID, TAILOR_ID, [Buffer.from('')])

    expect(result).toEqual({ rejected: 'UNRELATED' })
    expect(appendOrderEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'PHOTOS_REJECTED_UNRELATED' }),
    )
  })

  it('CHECK_PASSED: all MET → transitions to CHECK_PASSED', async () => {
    setupSubmitOrder()
    vi.mocked(verifyPhotos).mockResolvedValue({
      photoAssessments: [{ imageRef: 'photo-1', unrelated: false, unrelatedReason: '' }],
      verdicts: [{ itemId: 'item-1', verdict: 'MET', evidence: '', imageRefs: [], feedbackForTailor: '' }],
      notes: '',
    })
    const tx = mockTransaction()
    tx.order.findUniqueOrThrow = vi.fn().mockResolvedValue(makeOrder({ state: 'IN_PROGRESS' }))
    tx.order.update = vi.fn().mockResolvedValue({})

    const result = await submitPhotos(ORDER_ID, TAILOR_ID, [Buffer.from('')])

    expect(result).toEqual({ state: 'CHECK_PASSED' })
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'CHECK_PASSED' }) }),
    )
  })

  it('CHECK_FAILED: some NOT_MET → transitions to CHECK_FAILED, increments round', async () => {
    setupSubmitOrder()
    vi.mocked(verifyPhotos).mockResolvedValue({
      photoAssessments: [{ imageRef: 'photo-1', unrelated: false, unrelatedReason: '' }],
      verdicts: [{ itemId: 'item-1', verdict: 'NOT_MET', evidence: 'hem too short', imageRefs: [], feedbackForTailor: 'hem too short' }],
      notes: '',
    })
    const tx = mockTransaction()
    tx.order.findUniqueOrThrow = vi.fn().mockResolvedValue(makeOrder({ state: 'IN_PROGRESS', checkRound: 0 }))
    tx.order.update = vi.fn().mockResolvedValue({})

    const result = await submitPhotos(ORDER_ID, TAILOR_ID, [Buffer.from('')])

    expect(result).toEqual({ state: 'CHECK_FAILED' })
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'CHECK_FAILED', checkRound: 1 }) }),
    )
  })

  it('NEEDS_MANUAL_REVIEW: stays SUBMITTED, sets needsManualReview', async () => {
    setupSubmitOrder()
    vi.mocked(verifyPhotos).mockResolvedValue({ status: 'NEEDS_MANUAL_REVIEW', reason: 'AI blew up' })
    const tx = mockTransaction()
    tx.order.update = vi.fn().mockResolvedValue({})

    const result = await submitPhotos(ORDER_ID, TAILOR_ID, [Buffer.from('')])

    expect(result).toEqual({ needsManualReview: true, reason: 'AI blew up' })
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'SUBMITTED', needsManualReview: true }) }),
    )
  })
})

// ── resolveFailedChecks ────────────────────────────────────────────────────────

describe('resolveFailedChecks', () => {
  it('ACCEPT_ANYWAY: transitions CHECK_FAILED → CHECK_PASSED with acceptAnyway=true', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeOrder({ state: 'CHECK_FAILED', checkRound: 2 }))
    const tx = mockTransaction()
    tx.order.update = vi.fn().mockResolvedValue({})

    await resolveFailedChecks(ORDER_ID, CUSTOMER_ID, 'ACCEPT_ANYWAY')

    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'CHECK_PASSED', acceptAnyway: true }) }),
    )
  })

  it('CANCEL: voids all live authorizations', async () => {
    // First call for the outer read; second inside voidAllLive
    const livePayment = { id: 'pay-1', paypalAuthorizationId: 'auth-1', status: 'AUTHORIZED' }
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn()
        .mockResolvedValueOnce(makeOrder({ state: 'CHECK_FAILED', checkRound: 2 }))
        // voidAllLive inner read
        .mockResolvedValueOnce({ ...makeOrder({ state: 'CHECK_FAILED' }), payments: [livePayment] })
    vi.mocked(voidAuthorization).mockResolvedValue(undefined)
    const tx = mockTransaction()
    tx.payment.update = vi.fn().mockResolvedValue({})
    tx.order.findUniqueOrThrow = vi.fn().mockResolvedValue(makeOrder({ state: 'CHECK_FAILED' }))
    tx.order.update = vi.fn().mockResolvedValue({})

    await resolveFailedChecks(ORDER_ID, CUSTOMER_ID, 'CANCEL')

    expect(voidAuthorization).toHaveBeenCalledWith('auth-1')
  })

  it('throws InvalidTransitionError when fewer than 2 rounds exhausted', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeOrder({ state: 'CHECK_FAILED', checkRound: 1 }))

    await expect(resolveFailedChecks(ORDER_ID, CUSTOMER_ID, 'ACCEPT_ANYWAY')).rejects.toThrow(InvalidTransitionError)
  })
})

// ── release ────────────────────────────────────────────────────────────────────

describe('release', () => {
  it('throws GateBlockedError when order is not in SHIPPED state', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue({
        ...makeOrder({ state: 'CHECK_PASSED', acceptAnyway: false }),
        checklistVersions: [makeCV()],
        fitConfirmations: [],
        payments: [],
      })
    vi.mocked(prisma.orderEvent as never as { findFirst: ReturnType<typeof vi.fn> }).findFirst =
      vi.fn().mockResolvedValue(null)

    await expect(release(ORDER_ID, CUSTOMER_ID)).rejects.toThrow(GateBlockedError)
  })

  it('captures all live authorizations when gate passes', async () => {
    const livePayment = { id: 'pay-1', paypalAuthorizationId: 'auth-1', status: 'AUTHORIZED' }
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn()
        // release outer read
        .mockResolvedValueOnce({
          ...makeOrder({ state: 'SHIPPED', acceptAnyway: false }),
          checklistVersions: [makeCV({ items: [] })],
          fitConfirmations: [],
          payments: [livePayment],
        })
        // captureAllLive read
        .mockResolvedValueOnce({ ...makeOrder({ state: 'SHIPPED' }), payments: [livePayment] })
    vi.mocked(prisma.orderEvent as never as { findFirst: ReturnType<typeof vi.fn> }).findFirst =
      vi.fn().mockResolvedValue({ payload: { verdicts: [] } })
    vi.mocked(captureAuthorization).mockResolvedValue({ captureId: 'cap-1', status: 'COMPLETED' })
    vi.mocked(writeReceipt).mockResolvedValue({ text_en: 'Receipt', text_local: 'Receipt' })
    const tx = mockTransaction()
    tx.payment.update = vi.fn().mockResolvedValue({})
    tx.order.findUniqueOrThrow = vi.fn().mockResolvedValue(makeOrder({ state: 'SHIPPED' }))
    tx.order.update = vi.fn().mockResolvedValue({})

    const result = await release(ORDER_ID, CUSTOMER_ID)

    expect(captureAuthorization).toHaveBeenCalledWith('auth-1')
    expect(result.receiptText).toEqual({ text_en: 'Receipt', text_local: 'Receipt' })
  })
})

// ── cancelOrder ────────────────────────────────────────────────────────────────

describe('cancelOrder', () => {
  it('no live auth → transitions to CANCELLED', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue({ ...makeOrder({ state: 'DRAFT' }), payments: [] })
    const tx = mockTransaction()
    tx.order.findUniqueOrThrow = vi.fn().mockResolvedValue(makeOrder({ state: 'DRAFT' }))
    tx.order.update = vi.fn().mockResolvedValue({})

    await cancelOrder(ORDER_ID, CUSTOMER_ID)

    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'CANCELLED' }) }),
    )
  })

  it('with live auth → voids authorization and transitions to VOIDED', async () => {
    const livePayment = { id: 'pay-1', paypalAuthorizationId: 'auth-1', status: 'AUTHORIZED' }
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn()
        .mockResolvedValueOnce({ ...makeOrder({ state: 'AUTHORIZED' }), payments: [livePayment] })
        // voidAllLive inner read
        .mockResolvedValueOnce({ ...makeOrder({ state: 'AUTHORIZED' }), payments: [livePayment] })
    vi.mocked(voidAuthorization).mockResolvedValue(undefined)
    const tx = mockTransaction()
    tx.payment.update = vi.fn().mockResolvedValue({})
    tx.order.findUniqueOrThrow = vi.fn().mockResolvedValue(makeOrder({ state: 'AUTHORIZED' }))
    tx.order.update = vi.fn().mockResolvedValue({})

    await cancelOrder(ORDER_ID, CUSTOMER_ID)

    expect(voidAuthorization).toHaveBeenCalledWith('auth-1')
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'VOIDED' }) }),
    )
  })
})

// ── reportProblem ──────────────────────────────────────────────────────────────

describe('reportProblem', () => {
  it('transitions to DISPUTED and appends event', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeOrder({ state: 'AUTHORIZED' }))
    const tx = mockTransaction()
    tx.order.findUniqueOrThrow = vi.fn().mockResolvedValue(makeOrder({ state: 'AUTHORIZED' }))
    tx.order.update = vi.fn().mockResolvedValue({})

    await reportProblem(ORDER_ID, CUSTOMER_ID, 'outfit is wrong colour')

    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'DISPUTED' }) }),
    )
    expect(appendOrderEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: 'DISPUTED', note: 'outfit is wrong colour' }),
    )
  })

  it('throws ForbiddenError for unrelated user', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeOrder({ state: 'AUTHORIZED' }))

    await expect(reportProblem(ORDER_ID, 'stranger-99', 'bad')).rejects.toThrow(ForbiddenError)
  })

  it('throws InvalidTransitionError from an already-terminal state', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeOrder({ state: 'RELEASED' }))

    await expect(reportProblem(ORDER_ID, CUSTOMER_ID, 'too late')).rejects.toThrow(InvalidTransitionError)
  })
})

// ── F1: acceptChecklist derives role from actorId ─────────────────────────────

describe('acceptChecklist role derivation (F1)', () => {
  it('customer accept sets customerAcceptedAt, tailor accept sets tailorAcceptedAt, second → AGREED', async () => {
    // Tailor accepts first
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeOrder())
    vi.mocked(prisma.checklistVersion as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeCV())
    vi.mocked(prisma.checklistVersion as never as { findFirst: ReturnType<typeof vi.fn> }).findFirst =
      vi.fn().mockResolvedValue(makeCV())

    const tx = mockTransaction()
    tx.checklistVersion.update = vi.fn().mockResolvedValue({})
    tx.checklistVersion.findUniqueOrThrow = vi.fn().mockResolvedValue(
      makeCV({ tailorAcceptedAt: new Date(), customerAcceptedAt: null }),
    )

    // No role param — derived from TAILOR_ID matching order.tailorId
    const r1 = await acceptChecklist(ORDER_ID, VERSION_ID, TAILOR_ID)
    expect(r1).toEqual({ agreed: false })
    expect(tx.checklistVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tailorAcceptedAt: expect.any(Date) }) }),
    )
  })
})

// ── F2: recheckPhotos ─────────────────────────────────────────────────────────

describe('recheckPhotos (F2)', () => {
  it('re-runs verify on stored photos without incrementing round', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue({
        ...makeOrder({ state: 'SUBMITTED', needsManualReview: true, checkRound: 1 }),
        checklistVersions: [makeCV()],
      })
    vi.mocked(prisma.photo as never as { findMany: ReturnType<typeof vi.fn> }).findMany =
      vi.fn().mockResolvedValue([
        { storagePath: `orders/${ORDER_ID}/round-0/0.jpg`, round: 0, createdAt: new Date() },
      ])
    vi.mocked(verifyPhotos).mockResolvedValue({
      photoAssessments: [{ imageRef: 'photo-1', unrelated: false, unrelatedReason: '' }],
      verdicts: [{ itemId: 'item-1', verdict: 'MET', evidence: '', imageRefs: [], feedbackForTailor: '' }],
      notes: '',
    })
    const tx = mockTransaction()
    tx.order.update = vi.fn().mockResolvedValue({})

    const result = await recheckPhotos(ORDER_ID, TAILOR_ID)

    expect(result).toEqual({ state: 'CHECK_PASSED' })
    expect(downloadPhoto).toHaveBeenCalledWith(`orders/${ORDER_ID}/round-0/0.jpg`)
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'CHECK_PASSED', needsManualReview: false }) }),
    )
  })

  it('throws if not in SUBMITTED with needsManualReview', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue({
        ...makeOrder({ state: 'IN_PROGRESS', needsManualReview: false }),
        checklistVersions: [makeCV()],
      })

    await expect(recheckPhotos(ORDER_ID, TAILOR_ID)).rejects.toThrow(InvalidTransitionError)
  })
})

// ── F2: storage — event payload has no base64, recheck reads by key ──────────

describe('F2 storage', () => {
  it('submitPhotos NEEDS_MANUAL_REVIEW event has photoKeys, no base64', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue({
        ...makeOrder({ state: 'IN_PROGRESS', checkRound: 0 }),
        checklistVersions: [makeCV()],
      })
    vi.mocked(verifyPhotos).mockResolvedValue({ status: 'NEEDS_MANUAL_REVIEW', reason: 'AI blew up' })
    const tx = mockTransaction()
    tx.order.update = vi.fn().mockResolvedValue({})

    await submitPhotos(ORDER_ID, TAILOR_ID, [Buffer.from('img')])

    // uploadPhoto called
    expect(uploadPhoto).toHaveBeenCalledWith(
      `orders/${ORDER_ID}/round-0/0.jpg`,
      expect.any(Buffer),
    )
    // Photo row saved
    expect(tx.photo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ storagePath: `orders/${ORDER_ID}/round-0/0.jpg` }) }),
    )
    // Event payload: has photoKeys, no _pendingPhotos / base64
    const eventCall = vi.mocked(appendOrderEvent).mock.calls.find(
      (c) => (c[1] as { type: string }).type === 'STATE_CHANGE',
    )
    expect(eventCall).toBeDefined()
    const payload = (eventCall![1] as { payload: Record<string, unknown> }).payload
    expect(payload.photoKeys).toEqual([`orders/${ORDER_ID}/round-0/0.jpg`])
    expect(payload).not.toHaveProperty('_pendingPhotos')
    // No base64 string in any payload value
    for (const v of Object.values(payload)) {
      if (typeof v === 'string') expect(v.length).toBeLessThan(200)
    }
  })

  it('recheckPhotos downloads from storage by key', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue({
        ...makeOrder({ state: 'SUBMITTED', needsManualReview: true, checkRound: 1 }),
        checklistVersions: [makeCV()],
      })
    // Photo rows from DB
    vi.mocked(prisma.photo as never as { findMany: ReturnType<typeof vi.fn> }).findMany =
      vi.fn().mockResolvedValue([
        { storagePath: `orders/${ORDER_ID}/round-0/0.jpg`, round: 0, createdAt: new Date() },
      ])
    vi.mocked(verifyPhotos).mockResolvedValue({
      photoAssessments: [{ imageRef: 'photo-1', unrelated: false, unrelatedReason: '' }],
      verdicts: [{ itemId: 'item-1', verdict: 'MET', evidence: '', imageRefs: [], feedbackForTailor: '' }],
      notes: '',
    })
    const tx = mockTransaction()
    tx.order.update = vi.fn().mockResolvedValue({})

    const result = await recheckPhotos(ORDER_ID, TAILOR_ID)

    expect(result).toEqual({ state: 'CHECK_PASSED' })
    expect(downloadPhoto).toHaveBeenCalledWith(`orders/${ORDER_ID}/round-0/0.jpg`)
  })

  it('getOrderEvents strips _pendingPhotos from legacy payloads', async () => {
    vi.mocked(prisma.order as never as { findUniqueOrThrow: ReturnType<typeof vi.fn> }).findUniqueOrThrow =
      vi.fn().mockResolvedValue(makeOrder())
    vi.mocked(prisma.orderEvent as never as { findMany: ReturnType<typeof vi.fn> }).findMany =
      vi.fn().mockResolvedValue([
        { id: 'ev-1', payload: { needsManualReview: true, _pendingPhotos: ['base64data'] } },
        { id: 'ev-2', payload: { verdicts: [] } },
      ])

    const events = await getOrderEvents(ORDER_ID, TAILOR_ID)

    expect(events[0].payload).not.toHaveProperty('_pendingPhotos')
    expect((events[0].payload as Record<string, unknown>).needsManualReview).toBe(true)
    expect(events[1].payload).toEqual({ verdicts: [] })
  })
})

// ── F3: acceptChange safe-off ─────────────────────────────────────────────────

describe('acceptChange safe-off (F3)', () => {
  it('always throws ADDON_NOT_AVAILABLE, no version or total changes', async () => {
    await expect(acceptChange(ORDER_ID, 'change-1', CUSTOMER_ID)).rejects.toThrow(InvalidTransitionError)
    await expect(acceptChange(ORDER_ID, 'change-1', CUSTOMER_ID)).rejects.toThrow('ADDON_NOT_AVAILABLE')
  })
})
