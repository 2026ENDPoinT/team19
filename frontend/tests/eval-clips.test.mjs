import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { loadStoredClip } from '../src/services/clips.ts'
import { calculatePlayerState } from '../src/player/state.ts'
const root = new URL('../../samples/eval/', import.meta.url)
const originalFetch = globalThis.fetch
const signal = new AbortController().signal
try {
  const folders = readdirSync(root).filter(name => existsSync(new URL(`${name}/result-terra.json`, root)))
  assert.equal(folders.length, 5)
  for (const folder of folders) {
    const directory = new URL(`${folder}/`, root)
    const raw = JSON.parse(readFileSync(new URL('result-terra.json', directory), 'utf8'))
    const before = JSON.stringify(raw)
    const resultUrl = `http://localhost/assets/${folder}-result.json`
    const audioUrl = `http://localhost/assets/${folder}-audio.mp3`
    globalThis.fetch = async (url, options) => { assert.equal(url, resultUrl); assert.equal(options.signal, signal); return Response.json(raw) }
    const clip = await loadStoredClip(resultUrl, audioUrl, signal)
    assert.equal(clip.audioUrl, audioUrl)
    assert.ok(existsSync(new URL(raw.audioUrl, directory)))
    const points = new Set([0, clip.durationSec, ...clip.captions.flatMap(line => [line.startSec, line.endSec, Math.max(0, line.startSec - .001)])])
    for (const time of points) {
      const state = calculatePlayerState(clip.blueprint, clip.captions, time)
      calculatePlayerState(clip.blueprint, clip.captions, clip.durationSec)
      assert.deepEqual(calculatePlayerState(clip.blueprint, clip.captions, time), state)
      for (const page of state.sourcePages) assert.ok(existsSync(new URL(`pages/page-${String(page).padStart(3,'0')}.png`, directory)), `${folder}: missing page ${page}`)
    }
    assert.equal(JSON.stringify(raw), before)
    console.log(`PASS ${folder}: bundled audio, page mapping and ${points.size} seek points`)
  }
  globalThis.fetch = async () => Response.json({ audioUrl: '../other/audio.mp3' })
  await assert.rejects(loadStoredClip('http://localhost/result.json','http://localhost/audio.mp3',signal), /음성 묶음/)
  globalThis.fetch = async () => new Response('', {status:404})
  await assert.rejects(loadStoredClip('http://localhost/result.json','http://localhost/audio.mp3',signal), /404/)
  const cancelled = new AbortController()
  globalThis.fetch = async () => { cancelled.abort(); return Response.json({}) }
  await assert.rejects(loadStoredClip('http://localhost/result.json','http://localhost/audio.mp3',cancelled.signal), {name:'AbortError'})
} finally { globalThis.fetch = originalFetch }
