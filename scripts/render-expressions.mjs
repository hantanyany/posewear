#!/usr/bin/env node
// Run: node scripts/render-expressions.mjs /path/to/ICT-FaceKit [expression-id ...]
// The source geometry is ICT-FaceKit (MIT), revision da5f95a607f5e6b37755b38d3385d7f2853732e5.
// Set POSEWEAR_CHROME to use an alternate Chromium executable.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createRenderer } from './render-expressions-webgl.mjs';

const [, , faceKitPath, ...requestedIds] = process.argv;
if (!faceKitPath) {
  throw new Error('Usage: node scripts/render-expressions.mjs /path/to/ICT-FaceKit [expression-id ...]');
}

const catalogPath = fileURLToPath(new URL('../catalog/expressions/', import.meta.url));
const modelPath = path.join(faceKitPath, 'FaceXModel');
const source = await fs.readFile(path.join(catalogPath, 'presets.tsv'), 'utf8');
const [, ...lines] = source.trimEnd().split(/\r?\n/);
const allPresets = lines.map(line => {
  const [id, , , , , , rotation, blend = ''] = line.split('\t');
  const weights = {};
  for (const pair of blend.split(' ').filter(Boolean)) {
    const [name, amount] = pair.split('=');
    if (!Number.isFinite(Number(amount)) || !/^[a-zA-Z]+(?:_[LRB])?$/.test(name)) {
      throw new Error(`Invalid blendshape weight for ${id}: ${pair}`);
    }
    if (name.endsWith('_B')) {
      for (const side of ['L', 'R']) weights[name.replace(/B$/, side)] = Number(amount);
    } else {
      weights[name] = Number(amount);
    }
  }
  return { id, rotation: rotation.split(',').map(Number), weights };
});
const filter = new Set(requestedIds);
const presets = requestedIds.length ? allPresets.filter(preset => filter.has(preset.id)) : allPresets;
if (filter.size && presets.length !== filter.size) throw new Error('Unknown expression ID');

const materials = {
  M_Face: [0.68, 0.68, 0.68],
  M_BackHead: [0.68, 0.68, 0.68],
  M_GumsTongue: [0.29, 0.29, 0.29],
  M_Teeth: [0.80, 0.80, 0.80],
  M_ScleraLeft: [0.78, 0.78, 0.78],
  M_ScleraRight: [0.78, 0.78, 0.78],
};

function parseObj(sourceText, includeTopology = false) {
  const vertices = [];
  const groups = {};
  let faces;
  for (const line of sourceText.split('\n')) {
    if (line.startsWith('v ')) {
      vertices.push(...line.trim().split(/\s+/).slice(1, 4).map(Number));
    } else if (includeTopology && line.startsWith('usemtl ')) {
      const material = line.slice(7).trim();
      faces = material in materials ? (groups[material] ??= []) : undefined;
    } else if (includeTopology && faces && line.startsWith('f ')) {
      const corners = line.trim().split(/\s+/).slice(1).map(token => parseInt(token, 10) - 1);
      for (let index = 2; index < corners.length; index++) {
        faces.push(corners[0], corners[index - 1], corners[index]);
      }
    }
  }
  return { vertices, groups };
}

const model = parseObj(await fs.readFile(path.join(modelPath, 'generic_neutral_mesh.obj'), 'utf8'), true);
const blendshapeNames = [...new Set(presets.flatMap(preset => Object.keys(preset.weights)))];
const deltas = new Map();
for (const name of blendshapeNames) {
  const filename = path.join(modelPath, name + '.obj');
  const { vertices } = parseObj(await fs.readFile(filename, 'utf8'));
  if (vertices.length !== model.vertices.length) throw new Error(`Mismatched topology in ${filename}`);
  const delta = [];
  for (let index = 0; index < vertices.length; index++) {
    const value = vertices[index] - model.vertices[index];
    if (Math.abs(value) >= 0.0001) delta.push(index, value);
  }
  deltas.set(name, delta);
}

const launch = { headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
if (process.env.POSEWEAR_CHROME) launch.executablePath = process.env.POSEWEAR_CHROME;
const browser = await chromium.launch(launch);
try {
  const page = await browser.newPage();
  await page.evaluate(({ factory, mesh, palette }) => {
    // The renderer is serialized so Playwright can run it without a local server.
    const create = new Function(`return (${factory})`)();
    window.render = create(mesh, palette);
  }, { factory: createRenderer.toString(), mesh: model, palette: materials });

  const outputPath = path.join(catalogPath, 'images');
  await fs.mkdir(outputPath, { recursive: true });
  for (const preset of presets) {
    const vertices = [...model.vertices];
    for (const [shape, strength] of Object.entries(preset.weights)) {
      const delta = deltas.get(shape);
      for (let index = 0; index < delta.length; index += 2) {
        vertices[delta[index]] += delta[index + 1] * strength;
      }
    }
    const views = await page.evaluate(
      ({ positions, pose, weights }) => window.render(positions, pose, weights),
      { positions: vertices, pose: preset.rotation, weights: preset.weights },
    );
    for (const [view, data] of Object.entries(views)) {
      await fs.writeFile(path.join(outputPath, `${preset.id}_${view}.webp`), Buffer.from(data, 'base64'));
    }
  }
  console.log(`Rendered ${presets.length} expressions from two views each.`);
} finally {
  await browser.close();
}
