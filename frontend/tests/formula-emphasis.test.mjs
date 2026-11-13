import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import katex from 'katex'
import { emphasizeFormula } from '../src/player/formulaEmphasis.ts'
import { palette } from '../src/player/colors.ts'
import { calculatePlayerState } from '../src/player/state.ts'
assert.deepEqual(Object.values(palette), ['#ace6f3','#fcd871','#79b562','#ff6b4f'])
const source = String.raw`V(s)=1+10+\gamma V(s')`
assert.equal(emphasizeFormula(source,'설명',false),source)
const part=emphasizeFormula(source,'$1$과 $\\gamma$를 설명해요',true)
assert.ok(part.includes(`\\textcolor{${palette.coral}}{1}+10`))
assert.ok(part.includes(`\\textcolor{${palette.coral}}{\\gamma}`))
assert.equal(emphasizeFormula('10', '$1$', true), '10')
assert.equal(emphasizeFormula('x+y', '$z$', true), 'x+y')
assert.ok(!emphasizeFormula(String.raw`\alphabet+\alpha`,'$\\alpha$',true).includes('}bet'))
assert.ok(emphasizeFormula(source,'항 정보 없음',true).startsWith(`\\textcolor{${palette.coral}}{`))
katex.renderToString(part,{throwOnError:true,trust:false})
const entity={id:'f',style:'formula',slot:'middle',content:source}
const blueprint={version:0,title:'test',theme:'dark',scenes:[{id:'s',clear:true,sourcePages:[],texts:[entity],slides:[],diagrams:[],grids:[],codes:[],lines:['설명','다음'],actions:[{line:0,do:'highlight',target:'f',args:[]}]}]}
const captions=[{sceneId:'s',lineIndex:0,text:'$1$ 설명',startSec:0,endSec:2},{sceneId:'s',lineIndex:1,text:'다음 설명',startSec:3,endSec:5}]
const before=JSON.stringify(blueprint)
// 문장 사이 쉼(2~3초)에도 직전 문장 강조를 유지한다(Q-AI-41).
for(const [time,active] of [[0,true],[1,true],[2,true],[2.5,true],[3,false],[5,false],[1,true],[0,true]]) {
 const state=calculatePlayerState(blueprint,captions,time)
 assert.equal(state.elements[0].explaining,active)
 assert.equal(state.elements[0].highlighted,true,'existing logical highlight preserved')
 if(!active)assert.equal(emphasizeFormula(source,state.caption,state.elements[0].explaining),source)
}
assert.equal(JSON.stringify(blueprint),before)
const rl=JSON.parse(readFileSync(new URL('../../samples/eval/rl-mdp-review-c4/result-terra.json',import.meta.url),'utf8'))
for(const scene of rl.blueprint.scenes) for(const text of scene.texts) if(text.style==='formula') {
 const content=text.content
 // Real formulas may contain dollar delimiters; the renderer handles those separately.
 if(!content.includes('$')) katex.renderToString(emphasizeFormula(content,'',true),{throwOnError:true,trust:false})
}
console.log('PASS palette, exact formula terms, number/command boundaries, timed reset, gaps, seek, source preservation and real KaTeX rendering')
