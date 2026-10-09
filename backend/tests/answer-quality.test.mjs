import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimateTokens } from '../../shared/ai/tokenize.mjs';
import { buildIndex, search, selectSources } from '../../shared/ai/retrieve.mjs';
import { compileGuard, guardRequest } from '../../shared/ai/guard.mjs';
const wb = JSON.parse(readFileSync(new URL('../../generated/ai/worldbook.json', import.meta.url)));
const bundle = JSON.parse(readFileSync(new URL('../../generated/ai/prompt-bundle.json', import.meta.url)));
const index = buildIndex(wb);
const cases = [
 ['personalized writing','personal-writing-lora'], ['speech to todo','kk-knock'],
 ['distributed LLM training','distributed-llm'], ['AWS web app','cloud-native'],
 ['food rescue workflow','enterprise-workflow'], ['equipment borrowing','equipment-assignment'],
 ['Bayesian race prediction','f1-bayesian'], ['stock ranking','quant-ai'], ['ecommerce project','smartbuyer'],
 ['个人分隔化写作项目','personal-writing-lora'], ['Personal Writng LoRA','personal-writing-lora'],
 ['个性化写作那个项目','personal-writing-lora'], ['语音待办项目','kk-knock'],
 ['分布式大模型训练','distributed-llm'], ['AWS 云原生项目','cloud-native'],
 ['食物救助项目','enterprise-workflow'], ['设备作业平台','equipment-assignment'],
 ['F1 贝叶斯预测','f1-bayesian'], ['股票排序项目','quant-ai'], ['SmartByer','smartbuyer'],
];
test('project references tolerate reviewed descriptions and bounded typos', () => {
 for (const [question,scope] of cases) {
  const r=search(index,{question});
  assert.deepEqual(r.named,[scope],question);
  assert.equal(guardRequest(compileGuard(bundle.guard),{message:question,history:[],result:r}).action,'answer',question);
  const sources=selectSources(index,r);
  assert.ok(sources.some(e=>e.scope===scope&&e.sectionId==='@overview'),question);
  assert.ok(sources.filter(e=>e.scope===scope).length>=3,question);
 }
});
test('technical why questions include rationale and directly relevant implementation', () => {
 const r=search(index,{question:'LoRA 项目为什么用 SQS？'});
 const sources=selectSources(index,r);
 for (const section of ['@overview','job-handoff','decisions']) assert.ok(sources.some(e=>e.scope==='personal-writing-lora'&&e.sectionId===section),section);
});
test('explicit typo reference overrides an unrelated page', () => {
 const r=search(index,{question:'Personal Writng LoRA architecture',pagePath:'/projects/kk-knock/'});
 assert.deepEqual(r.named,['personal-writing-lora']);
 assert.ok(selectSources(index,r).every(e=>e.scope==='personal-writing-lora'));
});
test('irrelevant phrases do not resolve to a project by fuzzy matching', () => {
 for (const question of ['personal weather forecast','今天吃什么','write a poem about clouds']) assert.deepEqual(search(index,{question}).named,[],question);
});
test('evidence selection respects its budget and keeps topic through follow-ups', () => {
 const r=search(index,{question:'Why this approach?',previous:'Personal Writng LoRA',budgetTokens:2000});
 assert.ok(selectSources(index,r).every(e=>e.scope==='personal-writing-lora'));
 assert.ok(selectSources(index,r).some(e=>e.sectionId==='decisions'));
 assert.ok(selectSources(index,r).reduce((n,e)=>n+estimateTokens(e.text),0)<=2000);
});
test('ambiguous fuzzy references are candidates rather than guessed projects', async () => {
 const {resolveProjects,projectReferences}=await import('../../shared/ai/projects.mjs');
 const projects=projectReferences({projectNames:[
  {scope:'alpha',title:{en:'Alpha tool',zh:'甲'},aliases:['WriterOne']},
  {scope:'beta',title:{en:'Beta tool',zh:'乙'},aliases:['WriterAne']},
 ]});
 const r=resolveProjects(projects,'WriterIne');
 assert.deepEqual(r.named,[]);
 assert.equal(r.candidates.length,2);
 assert.deepEqual(resolveProjects(projects,'WriterOne').named,['alpha']);
 assert.deepEqual(resolveProjects(projects,'xx').named,[]);
});

test('technical questions across the catalog receive relevant project sections', () => {
  const cases = [
    ['KK Knock 为什么在手机上转写，如何处理网络失败？','kk-knock',['product','reliability']],
    ['AWS 项目为什么使用 Packer 镜像发布？','cloud-native',['delivery']],
    ['分布式大模型训练为什么选择 FSDP？','distributed-llm',['fsdp']],
    ['FoodShelter 为什么用角色多态和工作队列？','enterprise-workflow',['domain-model','tradeoffs']],
    ['设备作业平台为什么换成 Redis 锁？','equipment-assignment',['editing','maintenance']],
    ['F1 为什么使用分层贝叶斯和模拟排序？','f1-bayesian',['model','simulation']],
    ['股票排序项目为什么区分训练标签与回测收益？','quant-ai',['pipeline','model']],
    ['SmartBuyer 如何做 Session 登录和后端分层？','smartbuyer',['backend']],
  ];
  for (const [question,scope,sections] of cases) {
    const sources = selectSources(index,search(index,{question}));
    assert.ok(sources.every((e)=>e.scope===scope),question);
    for (const section of sections) assert.ok(sources.some((e)=>e.sectionId===section),`${question}: ${section}`);
  }
});
