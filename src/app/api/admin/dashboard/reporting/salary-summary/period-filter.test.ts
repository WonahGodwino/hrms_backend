import assert from 'node:assert/strict'
import test from 'node:test'

import { getPeriodMonthCandidates } from './period-filter'

test('monthly period includes only selected month candidates', () => {
  const februaryCandidates = getPeriodMonthCandidates('monthly', 2, 1)

  assert.ok(februaryCandidates.includes('february'))
  assert.ok(februaryCandidates.includes('Feb'))
  assert.ok(februaryCandidates.includes('2'))
  assert.ok(februaryCandidates.includes('02'))
  assert.equal(februaryCandidates.includes('january'), false)
  assert.equal(februaryCandidates.includes('mar'), false)
})

test('quarterly period includes only quarter month candidates', () => {
  const q1Candidates = getPeriodMonthCandidates('quarterly', 2, 1)

  assert.ok(q1Candidates.includes('january'))
  assert.ok(q1Candidates.includes('february'))
  assert.ok(q1Candidates.includes('march'))
  assert.ok(q1Candidates.includes('Jan'))
  assert.ok(q1Candidates.includes('03'))
  assert.equal(q1Candidates.includes('april'), false)
  assert.equal(q1Candidates.includes('4'), false)
})

test('yearly period does not add month query filter candidates', () => {
  const yearlyCandidates = getPeriodMonthCandidates('yearly', 2, 1)
  assert.deepEqual(yearlyCandidates, [])
})
