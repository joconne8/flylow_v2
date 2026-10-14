import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAMPLE_DRAFT, SAMPLE_REQUEST, approvePolicy, createDemoPolicy, validatePolicy } from './policy';
import { OFFERS } from './fixtures';
import { evaluateOffer } from './evaluateOffer';

const approved = approvePolicy(SAMPLE_DRAFT, true);
assert.ok(approved.ok);
const approval = approved.approval;

test('Typical: A produces one stable simulated receipt and every rule passes', () => {
  const result = evaluateOffer(OFFERS[0], SAMPLE_DRAFT, approval);
  assert.equal(result.decision, 'BOOK_SIMULATED');
  assert.equal(result.receipt?.reference, 'DEMO-A');
  assert.equal(result.receipt?.totalCents, 61200);
  assert.ok(result.rules.every(r => r.status === 'pass'));
  assert.deepEqual(evaluateOffer(OFFERS[0], SAMPLE_DRAFT, approval), result);
});
test('Challenge: B is rejected for exceeding cap by one dollar', () => {
  const result = evaluateOffer(OFFERS[1], SAMPLE_DRAFT, approval);
  assert.equal(result.decision, 'REJECT');
  assert.equal(result.receipt, null);
  assert.deepEqual(result.rules.filter(r => r.status === 'fail').map(r => r.id), ['total']);
});
test('Incomplete: C requires review for unknown baggage and fare', () => {
  const result = evaluateOffer(OFFERS[2], SAMPLE_DRAFT, approval);
  assert.equal(result.decision, 'NEEDS_REVIEW');
  assert.equal(result.receipt, null);
  assert.deepEqual(result.rules.filter(r => r.status === 'unknown').map(r => r.id), ['bags', 'fare']);
});
test('Invalid policies and missing consent cannot approve', () => {
  for (const draft of [
    {...SAMPLE_DRAFT, origin:''}, {...SAMPLE_DRAFT, budgetUsd:'-1'},
    {...SAMPLE_DRAFT, checkedBags:''}, {...SAMPLE_DRAFT, outboundStart:'2027-02-30'},
    {...SAMPLE_DRAFT, destination:'ORD'}, {...SAMPLE_DRAFT, allowOvernight:null}
  ]) {
    assert.equal(validatePolicy(draft).ok, false);
    assert.equal(approvePolicy(draft, true).ok, false);
  }
  assert.equal(approvePolicy(SAMPLE_DRAFT, false).ok, false);
});
test('Changed cap or absent approval blocks evaluation', () => {
  assert.equal(evaluateOffer(OFFERS[0], {...SAMPLE_DRAFT, budgetUsd:'700'}, approval).decision, 'BLOCK');
  assert.equal(evaluateOffer(OFFERS[0], SAMPLE_DRAFT, null).decision, 'BLOCK');
});
test('Only sample parsing is supported', () => {
  assert.equal(createDemoPolicy(SAMPLE_REQUEST).ok, true);
  assert.equal(createDemoPolicy('Fly to Paris').ok, false);
  assert.equal(createDemoPolicy('').ok, false);
});
