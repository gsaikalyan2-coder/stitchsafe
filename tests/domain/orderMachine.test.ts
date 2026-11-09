import { describe, it, expect } from 'vitest'
import { canTransition, canActorTransition, OrderState } from '../../src/domain/orderMachine'

describe('happy path transitions', () => {
  it('DRAFT → PROPOSED', () => expect(canTransition(OrderState.DRAFT, OrderState.PROPOSED)).toBe(true))
  it('PROPOSED → AGREED', () => expect(canTransition(OrderState.PROPOSED, OrderState.AGREED)).toBe(true))
  it('AGREED → AUTHORIZED', () => expect(canTransition(OrderState.AGREED, OrderState.AUTHORIZED)).toBe(true))
  it('AUTHORIZED → IN_PROGRESS', () => expect(canTransition(OrderState.AUTHORIZED, OrderState.IN_PROGRESS)).toBe(true))
  it('IN_PROGRESS → SUBMITTED', () => expect(canTransition(OrderState.IN_PROGRESS, OrderState.SUBMITTED)).toBe(true))
  it('SUBMITTED → CHECK_PASSED', () => expect(canTransition(OrderState.SUBMITTED, OrderState.CHECK_PASSED)).toBe(true))
  it('SUBMITTED → CHECK_FAILED', () => expect(canTransition(OrderState.SUBMITTED, OrderState.CHECK_FAILED)).toBe(true))
  it('CHECK_PASSED → SHIPPED', () => expect(canTransition(OrderState.CHECK_PASSED, OrderState.SHIPPED)).toBe(true))
  it('SHIPPED → RELEASED', () => expect(canTransition(OrderState.SHIPPED, OrderState.RELEASED)).toBe(true))
})

describe('re-upload rounds', () => {
  it('CHECK_FAILED → SUBMITTED allowed when rounds < 2', () => {
    expect(canTransition(OrderState.CHECK_FAILED, OrderState.SUBMITTED, { reUploadRounds: 0 })).toBe(true)
    expect(canTransition(OrderState.CHECK_FAILED, OrderState.SUBMITTED, { reUploadRounds: 1 })).toBe(true)
  })

  it('CHECK_FAILED → SUBMITTED blocked when rounds >= 2', () => {
    expect(canTransition(OrderState.CHECK_FAILED, OrderState.SUBMITTED, { reUploadRounds: 2 })).toBe(false)
    expect(canTransition(OrderState.CHECK_FAILED, OrderState.SUBMITTED, { reUploadRounds: 3 })).toBe(false)
  })

  it('CHECK_FAILED → CHECK_PASSED (accept-anyway) allowed when rounds >= 2', () => {
    expect(canTransition(OrderState.CHECK_FAILED, OrderState.CHECK_PASSED, { reUploadRounds: 2 })).toBe(true)
    expect(canTransition(OrderState.CHECK_FAILED, OrderState.CHECK_PASSED, { reUploadRounds: 3 })).toBe(true)
  })

  it('CHECK_FAILED → CHECK_PASSED blocked when rounds < 2', () => {
    expect(canTransition(OrderState.CHECK_FAILED, OrderState.CHECK_PASSED, { reUploadRounds: 0 })).toBe(false)
    expect(canTransition(OrderState.CHECK_FAILED, OrderState.CHECK_PASSED, { reUploadRounds: 1 })).toBe(false)
  })
})

describe('CANCELLED side exit', () => {
  it('DRAFT → CANCELLED allowed (pre-authorization)', () => {
    expect(canTransition(OrderState.DRAFT, OrderState.CANCELLED)).toBe(true)
  })
  it('PROPOSED → CANCELLED allowed', () => {
    expect(canTransition(OrderState.PROPOSED, OrderState.CANCELLED)).toBe(true)
  })
  it('AGREED → CANCELLED allowed', () => {
    expect(canTransition(OrderState.AGREED, OrderState.CANCELLED)).toBe(true)
  })
  it('AUTHORIZED → CANCELLED blocked (must VOID instead)', () => {
    expect(canTransition(OrderState.AUTHORIZED, OrderState.CANCELLED)).toBe(false)
  })
  it('IN_PROGRESS → CANCELLED blocked', () => {
    expect(canTransition(OrderState.IN_PROGRESS, OrderState.CANCELLED)).toBe(false)
  })
  it('SHIPPED → CANCELLED blocked', () => {
    expect(canTransition(OrderState.SHIPPED, OrderState.CANCELLED)).toBe(false)
  })
})

describe('VOIDED side exit', () => {
  it('AUTHORIZED → VOIDED allowed', () => expect(canTransition(OrderState.AUTHORIZED, OrderState.VOIDED)).toBe(true))
  it('IN_PROGRESS → VOIDED allowed', () => expect(canTransition(OrderState.IN_PROGRESS, OrderState.VOIDED)).toBe(true))
  it('SUBMITTED → VOIDED allowed', () => expect(canTransition(OrderState.SUBMITTED, OrderState.VOIDED)).toBe(true))
  it('CHECK_PASSED → VOIDED allowed', () => expect(canTransition(OrderState.CHECK_PASSED, OrderState.VOIDED)).toBe(true))
  it('CHECK_FAILED → VOIDED allowed', () => expect(canTransition(OrderState.CHECK_FAILED, OrderState.VOIDED)).toBe(true))
  it('SHIPPED → VOIDED allowed', () => expect(canTransition(OrderState.SHIPPED, OrderState.VOIDED)).toBe(true))
  it('DRAFT → VOIDED blocked', () => expect(canTransition(OrderState.DRAFT, OrderState.VOIDED)).toBe(false))
  it('AGREED → VOIDED blocked', () => expect(canTransition(OrderState.AGREED, OrderState.VOIDED)).toBe(false))
})

describe('DISPUTED side exit', () => {
  it('AUTHORIZED → DISPUTED allowed', () => expect(canTransition(OrderState.AUTHORIZED, OrderState.DISPUTED)).toBe(true))
  it('SHIPPED → DISPUTED allowed', () => expect(canTransition(OrderState.SHIPPED, OrderState.DISPUTED)).toBe(true))
  it('DRAFT → DISPUTED allowed', () => expect(canTransition(OrderState.DRAFT, OrderState.DISPUTED)).toBe(true))
  it('RELEASED → DISPUTED blocked (terminal)', () => expect(canTransition(OrderState.RELEASED, OrderState.DISPUTED)).toBe(false))
  it('CANCELLED → DISPUTED blocked (terminal)', () => expect(canTransition(OrderState.CANCELLED, OrderState.DISPUTED)).toBe(false))
})

describe('terminal states block all transitions', () => {
  const terminals = [OrderState.RELEASED, OrderState.CANCELLED, OrderState.VOIDED]
  const targets = Object.values(OrderState)
  for (const terminal of terminals) {
    it(`${terminal} → anything is blocked`, () => {
      for (const target of targets) {
        expect(canTransition(terminal, target)).toBe(false)
      }
    })
  }
})

describe('DISPUTED blocks all transitions', () => {
  it('DISPUTED → RELEASED blocked', () => expect(canTransition(OrderState.DISPUTED, OrderState.RELEASED)).toBe(false))
  it('DISPUTED → VOIDED blocked', () => expect(canTransition(OrderState.DISPUTED, OrderState.VOIDED)).toBe(false))
  it('DISPUTED → SHIPPED blocked', () => expect(canTransition(OrderState.DISPUTED, OrderState.SHIPPED)).toBe(false))
})

describe('invalid skip transitions', () => {
  it('DRAFT → AUTHORIZED blocked', () => expect(canTransition(OrderState.DRAFT, OrderState.AUTHORIZED)).toBe(false))
  it('PROPOSED → IN_PROGRESS blocked', () => expect(canTransition(OrderState.PROPOSED, OrderState.IN_PROGRESS)).toBe(false))
  it('AUTHORIZED → RELEASED blocked', () => expect(canTransition(OrderState.AUTHORIZED, OrderState.RELEASED)).toBe(false))
  it('IN_PROGRESS → CHECK_PASSED blocked', () => expect(canTransition(OrderState.IN_PROGRESS, OrderState.CHECK_PASSED)).toBe(false))
})

// ── Actor guard tests ────────────────────────────────────────────────────────

describe('canActorTransition — allowed actors', () => {
  it('TAILOR can propose (DRAFT → PROPOSED)', () => {
    expect(canActorTransition(OrderState.DRAFT, OrderState.PROPOSED, 'TAILOR')).toBe(true)
  })
  it('CUSTOMER can propose (DRAFT → PROPOSED)', () => {
    expect(canActorTransition(OrderState.DRAFT, OrderState.PROPOSED, 'CUSTOMER')).toBe(true)
  })
  it('SYSTEM records agreement (PROPOSED → AGREED)', () => {
    expect(canActorTransition(OrderState.PROPOSED, OrderState.AGREED, 'SYSTEM')).toBe(true)
  })
  it('CUSTOMER authorizes payment (AGREED → AUTHORIZED)', () => {
    expect(canActorTransition(OrderState.AGREED, OrderState.AUTHORIZED, 'CUSTOMER')).toBe(true)
  })
  it('TAILOR starts work (AUTHORIZED → IN_PROGRESS)', () => {
    expect(canActorTransition(OrderState.AUTHORIZED, OrderState.IN_PROGRESS, 'TAILOR')).toBe(true)
  })
  it('TAILOR submits photos (IN_PROGRESS → SUBMITTED)', () => {
    expect(canActorTransition(OrderState.IN_PROGRESS, OrderState.SUBMITTED, 'TAILOR')).toBe(true)
  })
  it('SYSTEM marks check failed (SUBMITTED → CHECK_FAILED)', () => {
    expect(canActorTransition(OrderState.SUBMITTED, OrderState.CHECK_FAILED, 'SYSTEM')).toBe(true)
  })
  it('SYSTEM marks check passed (SUBMITTED → CHECK_PASSED)', () => {
    expect(canActorTransition(OrderState.SUBMITTED, OrderState.CHECK_PASSED, 'SYSTEM')).toBe(true)
  })
  it('TAILOR re-uploads (CHECK_FAILED → SUBMITTED, rounds=0)', () => {
    expect(canActorTransition(OrderState.CHECK_FAILED, OrderState.SUBMITTED, 'TAILOR', { reUploadRounds: 0 })).toBe(true)
  })
  it('CUSTOMER accept-anyway (CHECK_FAILED → CHECK_PASSED, rounds=2)', () => {
    expect(canActorTransition(OrderState.CHECK_FAILED, OrderState.CHECK_PASSED, 'CUSTOMER', { reUploadRounds: 2 })).toBe(true)
  })
  it('TAILOR ships (CHECK_PASSED → SHIPPED)', () => {
    expect(canActorTransition(OrderState.CHECK_PASSED, OrderState.SHIPPED, 'TAILOR')).toBe(true)
  })
  it('CUSTOMER releases on fit confirm (SHIPPED → RELEASED)', () => {
    expect(canActorTransition(OrderState.SHIPPED, OrderState.RELEASED, 'CUSTOMER')).toBe(true)
  })
  it('SYSTEM auto-captures on day 25 (SHIPPED → RELEASED)', () => {
    expect(canActorTransition(OrderState.SHIPPED, OrderState.RELEASED, 'SYSTEM')).toBe(true)
  })
  it('CUSTOMER can cancel pre-auth (DRAFT → CANCELLED)', () => {
    expect(canActorTransition(OrderState.DRAFT, OrderState.CANCELLED, 'CUSTOMER')).toBe(true)
  })
  it('TAILOR can cancel pre-auth (PROPOSED → CANCELLED)', () => {
    expect(canActorTransition(OrderState.PROPOSED, OrderState.CANCELLED, 'TAILOR')).toBe(true)
  })
  it('CUSTOMER can void post-auth (AUTHORIZED → VOIDED)', () => {
    expect(canActorTransition(OrderState.AUTHORIZED, OrderState.VOIDED, 'CUSTOMER')).toBe(true)
  })
  it('TAILOR can void post-auth (AUTHORIZED → VOIDED)', () => {
    expect(canActorTransition(OrderState.AUTHORIZED, OrderState.VOIDED, 'TAILOR')).toBe(true)
  })
  it('CUSTOMER can dispute (SHIPPED → DISPUTED)', () => {
    expect(canActorTransition(OrderState.SHIPPED, OrderState.DISPUTED, 'CUSTOMER')).toBe(true)
  })
  it('TAILOR can dispute (SHIPPED → DISPUTED)', () => {
    expect(canActorTransition(OrderState.SHIPPED, OrderState.DISPUTED, 'TAILOR')).toBe(true)
  })
})

describe('canActorTransition — denied actors', () => {
  it('SYSTEM cannot propose', () => {
    expect(canActorTransition(OrderState.DRAFT, OrderState.PROPOSED, 'SYSTEM')).toBe(false)
  })
  it('CUSTOMER cannot record agreement', () => {
    expect(canActorTransition(OrderState.PROPOSED, OrderState.AGREED, 'CUSTOMER')).toBe(false)
  })
  it('TAILOR cannot authorize payment', () => {
    expect(canActorTransition(OrderState.AGREED, OrderState.AUTHORIZED, 'TAILOR')).toBe(false)
  })
  it('CUSTOMER cannot start work', () => {
    expect(canActorTransition(OrderState.AUTHORIZED, OrderState.IN_PROGRESS, 'CUSTOMER')).toBe(false)
  })
  it('SYSTEM cannot submit photos', () => {
    expect(canActorTransition(OrderState.IN_PROGRESS, OrderState.SUBMITTED, 'SYSTEM')).toBe(false)
  })
  it('TAILOR cannot mark check failed', () => {
    expect(canActorTransition(OrderState.SUBMITTED, OrderState.CHECK_FAILED, 'TAILOR')).toBe(false)
  })
  it('TAILOR cannot mark check passed from SUBMITTED', () => {
    expect(canActorTransition(OrderState.SUBMITTED, OrderState.CHECK_PASSED, 'TAILOR')).toBe(false)
  })
  it('SYSTEM cannot re-upload', () => {
    expect(canActorTransition(OrderState.CHECK_FAILED, OrderState.SUBMITTED, 'SYSTEM', { reUploadRounds: 0 })).toBe(false)
  })
  it('TAILOR cannot accept-anyway', () => {
    expect(canActorTransition(OrderState.CHECK_FAILED, OrderState.CHECK_PASSED, 'TAILOR', { reUploadRounds: 2 })).toBe(false)
  })
  it('CUSTOMER cannot ship', () => {
    expect(canActorTransition(OrderState.CHECK_PASSED, OrderState.SHIPPED, 'CUSTOMER')).toBe(false)
  })
  it('SYSTEM cannot cancel', () => {
    expect(canActorTransition(OrderState.DRAFT, OrderState.CANCELLED, 'SYSTEM')).toBe(false)
  })
  it('SYSTEM cannot void', () => {
    expect(canActorTransition(OrderState.AUTHORIZED, OrderState.VOIDED, 'SYSTEM')).toBe(false)
  })
  it('SYSTEM cannot dispute', () => {
    expect(canActorTransition(OrderState.SHIPPED, OrderState.DISPUTED, 'SYSTEM')).toBe(false)
  })
})
