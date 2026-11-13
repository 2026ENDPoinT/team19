import assert from 'node:assert/strict'
import { ownerId, randomOwnerId } from '../src/services/ownerId.ts'
const map = new Map()
const store = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) }
const first = ownerId(store, () => 'a'.repeat(32))
assert.equal(first, 'a'.repeat(32)); assert.equal(map.get('eidos-owner-id'), first)
assert.equal(ownerId(store, () => 'b'.repeat(32)), first) // 다시 만들지 않는다
map.set('eidos-owner-id', 'bad id!'); assert.equal(ownerId(store, () => 'c'.repeat(32)), first) // 잘못된 값은 같은 탭 ID로 덮는다
const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
assert.match(ownerId(broken), /^[A-Za-z0-9_-]{16,64}$/)
// http://<IP>처럼 randomUUID가 없는 곳에서도 형식에 맞는 ID를 만든다
assert.match(randomOwnerId({ getRandomValues: (a) => { a.fill(171); return a } }), /^(ab){16}$/)
assert.match(randomOwnerId(), /^[0-9a-f]{32}$/)
console.log('PASS owner id: create once, reuse, replace invalid, storage blocked')
