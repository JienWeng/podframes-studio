import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const workflow = JSON.parse(readFileSync(new URL('./podframes-seven-stages.json', import.meta.url)));
const nodes = new Map(workflow.nodes.map(node => [node.name, node]));
function run(name, input = [], references = {}, now = 1000) {
  const result = vm.runInNewContext(`(function () { ${nodes.get(name).parameters.jsCode}\n})()`, {
    $execution: { id: '12345' },
    $input: { first: () => ({ json: input[0] }), all: () => input.map(json => ({ json })) },
    $: name => ({ first: () => ({ json: references[name] }), item: { json: references[name] } }),
    Date: { now: () => now },
  });
  return JSON.parse(JSON.stringify(result));
}
const settings = run('Episode settings')[0].json;
const episode = { ...settings, slug: 'test-episode', options: settings.config.options };
const ready = { automation: true, worker: true, codex: true, fish: true, whisper: true, ffmpeg: true, replicate: true };
const stages = ['script', 'speech', 'stills', 'video', 'broll', 'compose', 'render'];

test('workflow wiring, credentials and idempotency stay safe', () => {
  assert.equal(nodes.size, workflow.nodes.length);
  assert.equal(workflow.active, false);
  for (const [source, outputs] of Object.entries(workflow.connections)) {
    assert.ok(nodes.has(source));
    for (const edges of outputs.main) for (const edge of edges) assert.ok(nodes.has(edge.node));
  }
  const loop = workflow.connections['One stage at a time'].main;
  assert.equal(loop[0][0].node, 'Episode ready');
  assert.equal(loop[1][0].node, 'Begin stage');
  const http = workflow.nodes.filter(node => node.type.endsWith('.httpRequest'));
  assert.equal(http.length, 6);
  for (const node of http) {
    assert.equal(node.parameters.genericAuthType, 'httpHeaderAuth');
    assert.equal(node.retryOnFail, false);
    assert.equal(node.credentials, undefined);
    if (node.parameters.method === 'POST') {
      assert.equal(node.parameters.headerParameters.parameters[0].name, 'Idempotency-Key');
    }
  }
  for (const node of workflow.nodes) {
    for (const value of JSON.stringify(node.parameters).matchAll(/"(=\{\{.*?\}\})"/g)) {
      const expression = JSON.parse('"' + value[1] + '"');
      new Function('$', '$json', 'return (' + expression.slice(3, -2) + ')');
    }
  }
});

test('new and resumed episodes preserve saved configuration', () => {
  assert.match(settings.operationId, /^[a-zA-Z0-9._-]{16,100}$/);
  const project = { slug: 'saved-episode', options: { videoProvider: 'fal-ltx' } };
  const result = run('Prepare episode', [project], { 'Episode settings': settings })[0].json;
  assert.equal(result.slug, project.slug);
  assert.deepEqual(result.options, project.options);
  assert.throws(() => run('Prepare episode', [{ ...project, runActive: true }], { 'Episode settings': settings }), /active run/);
});

test('readiness blocks offline or unauthenticated generation', () => {
  for (const flag of Object.keys(ready)) {
    assert.throws(() => run('Plan seven stages', [{ ...ready, [flag]: false }], { 'Prepare episode': episode }), /Backend not ready/);
  }
  const planned = run('Plan seven stages', [ready], { 'Prepare episode': episode });
  assert.deepEqual(planned.map(item => item.json.stage), stages);
  const core = readFileSync(new URL('../../packages/core/src/pipeline.ts', import.meta.url), 'utf8');
  const coreStages = [...core.matchAll(/\{ name: "([a-z]+)", run: run\w+, needs:/g)].map(match => match[1]);
  assert.deepEqual(stages, coreStages);
});

test('each stage waits for job completion, then advances in order', () => {
  const completed = [];
  for (const stage of stages) {
    const context = run('Begin stage', [{ ...episode, stage }])[0].json;
    const references = { 'Begin stage': context };
    const project = { slug: episode.slug, runActive: true, stages: { [stage]: 'done' } };
    assert.equal(run('Check stage result', [project], references)[0].json.complete, false);
    project.runActive = false;
    if (stage === 'render') project.videoUrl = '/api/media/test-episode/output.mp4';
    const result = run('Check stage result', [project], references)[0].json;
    assert.equal(result.complete, true);
    completed.push(result);
  }
  const result = run('Episode ready', completed)[0].json;
  assert.equal(result.downloadUrl, settings.baseUrl + '/api/v1/media/test-episode/output.mp4');
  assert.deepEqual(result.stages.map(stage => stage.stage), stages);
});

test('errors, stopped jobs, timeout and unexpected download URLs fail closed', () => {
  const context = run('Begin stage', [{ ...episode, stage: 'speech' }])[0].json;
  const references = { 'Begin stage': context };
  const project = { slug: episode.slug, runActive: false, stages: { speech: 'error' }, stageErrors: { speech: 'uncertain Fish request' } };
  assert.throws(() => run('Check stage result', [project], references), /uncertain Fish request/);
  assert.throws(() => run('Check stage result', [{ ...project, stages: {} }], references), /no automatic retry/);
  assert.throws(() => run('Check stage result', [{ ...project, runActive: true }], references, context.deadline), /may still be running/);
  assert.throws(() => run('Check stage result', [{ ...project, runActive: undefined }], references), /Unexpected project/);
  assert.throws(() => run('Episode ready', [{ ...context, stage: 'render', complete: true, videoUrl: 'https://other.example/video.mp4' }]), /Unexpected media URL/);
});
