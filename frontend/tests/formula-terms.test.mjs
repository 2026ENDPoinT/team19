import assert from 'node:assert/strict'
import katex from 'katex'
import { parseFormulaTerms, renderFormulaTerms, formulaTermColors } from '../src/player/formulaTerms.ts'
import { palette } from '../src/player/colors.ts'
import { calculatePlayerState } from '../src/player/state.ts'
const repeated=String.raw`x+\term{middle}{x}+x`
assert.equal(renderFormulaTerms(repeated),'x+{x}+x')
assert.equal(renderFormulaTerms(repeated,{middle:palette.coral}),String.raw`x+\textcolor{#79b562}{x}+x`)
for(const source of [
 String.raw`\frac{\term{n}{a_{1}+b^{2}}}{\term{d}{c}}`,
 String.raw`\term{outer}{\frac{\term{inner}{x}}{y}}`,
 String.raw`\left\{\term{x}{a\{b\}}\right\}`,
 String.raw`Q^\pi(s,a)=\term{p}{\sum_{s'}P^a_{ss'}}\big[\term{r}{R^a_{ss'}}+\term{g}{\gamma\sum_{a'}\pi(s',a')Q^\pi(s',a')}\big]`,
]) {
 const ids=parseFormulaTerms(source).ids
 const colors=Object.fromEntries(ids.map((id,index)=>[id,formulaTermColors[index%4]]))
 for(const map of [{},colors])katex.renderToString(renderFormulaTerms(source,map),{throwOnError:true,trust:false})
}
for(const source of [String.raw`\term{x}{a`,String.raw`\term{x}`,String.raw`\term{A}{x}`,String.raw`\term{x}{a}+\term{x}{b}`,String.raw`\term{x}{\term{x}{a}}`]) assert.throws(()=>parseFormulaTerms(source))
assert.throws(()=>renderFormulaTerms(repeated,{middle:'red}{\\\\href{evil}'}),/색상/)
assert.deepEqual(parseFormulaTerms(String.raw`\\term{x}{a}`).ids,[],'escaped slash is not an annotation')
const content=String.raw`\term{a}{x}+\term{b}{x}+\term{c}{\frac{1}{2}}+\term{d}{y}`
const scene={id:'s',clear:true,sourcePages:[],lines:Array.from({length:7},(_,i)=>String(i)),texts:[{id:'f',slot:'middle',style:'formula',content}],slides:[],diagrams:[],grids:[],codes:[],actions:[
 {line:0,do:'highlight',target:'f',args:['b','c','d','a']},
 {line:1,do:'highlight',target:'f',args:['c','b']},
 {line:2,do:'unhighlight',target:'f',args:['b']},
 {line:3,do:'unhighlight',target:'f',args:[]},
 {line:4,do:'highlight',target:'f',args:[]},
 {line:5,do:'unhighlight',target:'f',args:['c']},
 {line:6,do:'unhighlight',target:'f',args:[]},
]}
const blueprint={version:0,title:'terms',theme:'dark',scenes:[scene]}
const timings=scene.lines.map((text,lineIndex)=>({sceneId:'s',lineIndex,text,startSec:lineIndex*2+1,endSec:lineIndex*2+2}))
const at=time=>calculatePlayerState(blueprint,timings,time).elements[0]
const original=JSON.stringify(blueprint)
assert.deepEqual({...at(0).formulaTermColors},{})
const expected={b:palette.coral,c:palette.mint,d:palette.yellow,a:palette.pink}
for(const time of [1.1,2,2.5,3.1,4.5])assert.deepEqual({...at(time).formulaTermColors},expected,'args order colors persist until unhighlight, including gaps')
assert.deepEqual({...at(5.5).formulaTermColors},{c:palette.mint,d:palette.yellow,a:palette.pink})
assert.deepEqual({...at(7.5).formulaTermColors},{})
assert.equal(at(9.5).formulaWhole,true)
assert.equal(at(11.5).formulaWhole,false)
assert.ok(!Object.hasOwn(at(11.5).formulaTermColors,'c'))
assert.deepEqual({...at(13.5).formulaTermColors},{})
const paused=at(1.5);at(13.5);assert.deepEqual(at(1.5),paused)
const retained={...scene,id:'next',clear:false,texts:[],lines:['continue'],actions:[]}
blueprint.scenes=[{...scene,lines:['one'],actions:scene.actions.slice(0,1)},retained]
const carry=[{sceneId:'s',lineIndex:0,text:'one',startSec:0,endSec:1},{sceneId:'next',lineIndex:0,text:'continue',startSec:1.5,endSec:2}]
assert.deepEqual({...calculatePlayerState(blueprint,carry,1.8).elements[0].formulaTermColors},expected)
blueprint.scenes=[scene]
scene.actions.push({line:2,do:'setText',target:'f',args:[String.raw`\term{a}{z}`]})
assert.deepEqual({...at(5.5).formulaTermColors},{a:palette.pink},'setText drops only removed terms')
scene.actions.push({line:2,do:'highlight',target:'f',args:['b']})
assert.throws(()=>at(5.5),/수식 항을 찾을 수/)
scene.actions.splice(-2)
assert.equal(JSON.stringify(blueprint),original)
scene.texts[0].formulaTermColors={b:'red}{bad'}
assert.deepEqual({...at(0).formulaTermColors},{},'runtime colors must not be accepted from source JSON')
delete scene.texts[0].formulaTermColors
console.log('PASS repeated symbols, fractions/subscripts/nesting, escapes, invalid annotations, 4 colors, persistent highlights, partial/full clear, setText, clear:false and seek')
