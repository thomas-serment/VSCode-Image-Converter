import * as assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { encode } from './codecs';
import { Pixels } from './image';
import { buildInputs } from './testing';
import type { Job, Result } from './worker';

// Runs the real bundled worker, the way VS Code does, to catch bundling problems.
function runJob(worker: Worker, job: Job): Promise<Result> {
	return new Promise((resolve, reject) => {
		worker.once('message', resolve);
		worker.once('error', reject);
		worker.postMessage(job);
	});
}

test('the bundled worker reads every input format', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'image-converter-bundle-'));
	const worker = new Worker(path.join(__dirname, '..', 'dist', 'worker.js'));
	try {
		let id = 100;
		for (const [format, { file, data }] of Object.entries(await buildInputs())) {
			const source = path.join(dir, file);
			await writeFile(source, data);
			const output = path.join(dir, 'out', `${format}.png`);
			const result = await runJob(worker, { id: ++id, source, output, format: 'png', quality: 80 });
			assert.equal(result.error, undefined, `${format}: ${result.error}`);
			assert.equal((await readFile(output)).subarray(1, 4).toString('latin1'), 'PNG', format);
		}
	} finally {
		await worker.terminate();
		await rm(dir, { recursive: true, force: true });
	}
});

test('the bundled worker converts every output format and refuses to overwrite', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'image-converter-bundle-'));
	const worker = new Worker(path.join(__dirname, '..', 'dist', 'worker.js'));
	try {
		const source = path.join(dir, 'a.png');
		const pixels = new Pixels(new Uint8ClampedArray(16 * 16 * 4).fill(180), 16, 16);
		await writeFile(source, await encode('png', pixels, 90));
		const magic: Record<string, string> = { jpg: '\xff\xd8\xff', png: '\x89PNG', webp: 'RIFF' };
		let id = 0;
		for (const format of ['webp', 'jpg', 'png'] as const) {
			const output = path.join(dir, 'out', `a.${format}`);
			const result = await runJob(worker, { id: id++, source, output, format, quality: 80 });
			assert.deepEqual(result, { id: id - 1 }, format);
			assert.ok((await readFile(output)).subarray(0, 4).toString('latin1').startsWith(magic[format].slice(0, 3)), `${format} magic bytes`);
		}
		const again = await runJob(worker, { id: id++, source, output: path.join(dir, 'out', 'a.png'), format: 'png', quality: 80 });
		assert.match(again.error ?? '', /EEXIST/);
		const missing = await runJob(worker, { id: id++, source: path.join(dir, 'nope.png'), output: path.join(dir, 'out', 'nope.png'), format: 'png', quality: 80 });
		assert.match(missing.error ?? '', /ENOENT/);
	} finally {
		await worker.terminate();
		await rm(dir, { recursive: true, force: true });
	}
});
