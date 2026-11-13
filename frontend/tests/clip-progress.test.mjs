import assert from 'node:assert/strict'
import { clipsDone } from '../src/services/jobStages.ts'
assert.equal(clipsDone([]), 0)
assert.equal(clipsDone([{ status: 'pending' }, { status: 'running', stage: 'queued' }]), 0)
assert.equal(clipsDone([{ status: 'completed' }, { status: 'running', stage: 'audio' }, { status: 'pending' }, { status: 'pending' }, { status: 'pending' }]), 1.8)
assert.equal(clipsDone([{ status: 'running', stage: 'blueprint' }]), 0.4)
assert.equal(clipsDone([{ status: 'running', stage: 'unknown-new' }]), 0) // 모르는 단계는 점수를 주지 않는다
assert.equal(clipsDone([{ status: 'failed' }, { status: 'completed' }]), 2) // 실패도 처리가 끝난 것으로 본다
console.log('PASS clip progress: stage partial credit, unknown stage, failed counts as finished')
