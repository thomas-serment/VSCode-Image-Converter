import * as assert from 'node:assert/strict';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { encode } from './codecs';
import { Pixels } from './image';
import { WorkerPool } from './pool';

async function withImage(run: (dir: string, source: string) => Promise<void>): Promise<void> {
	const dir = await mkdtemp(path.join(tmpdir(), 'image-converter-pool-'));
	try {
		const source = path.join(dir, 'a.png');
		await writeFile(source, await encode('png', new Pixels(new Uint8ClampedArray(16 * 16 * 4).fill(200), 16, 16), 90));
		await run(dir, source);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test('the pool converts many images with two workers', async () => {
	await withImage(async (dir, source) => {
		const pool = new WorkerPool(2);
		try {
			const outputs = Array.from({ length: 6 }, (_, i) => path.join(dir, 'out', `${i}.webp`));
			await Promise.all(outputs.map((output) => pool.run({ source, output, format: 'webp', quality: 80 })));
			for (const output of outputs) {
				await access(output);
			}
		} finally {
			await pool.dispose();
		}
	});
});

test('a failing job rejects without breaking the other jobs', async () => {
	await withImage(async (dir, source) => {
		const pool = new WorkerPool(1);
		try {
			const bad = pool.run({ source: path.join(dir, 'missing.png'), output: path.join(dir, 'out', 'x.png'), format: 'png', quality: 80 });
			const good = pool.run({ source, output: path.join(dir, 'out', 'ok.png'), format: 'png', quality: 80 });
			await assert.rejects(bad, /ENOENT/);
			await good;
			await access(path.join(dir, 'out', 'ok.png'));
		} finally {
			await pool.dispose();
		}
	});
});

test('disposing the pool rejects queued and later jobs instead of hanging', async () => {
	await withImage(async (dir, source) => {
		const pool = new WorkerPool(1);
		const jobs = Array.from({ length: 3 }, (_, i) => pool.run({ source, output: path.join(dir, 'out', `${i}.jpg`), format: 'jpg', quality: 80 }));
		const rejected = jobs.map((job) => assert.rejects(job, /Cancelled/));
		// The first job is running: dispose reports its output so the caller can remove a partial file.
		assert.deepEqual(await pool.dispose(), [path.join(dir, 'out', '0.jpg')]);
		await Promise.all(rejected);
		await assert.rejects(pool.run({ source, output: path.join(dir, 'out', 'late.jpg'), format: 'jpg', quality: 80 }), /Cancelled/);
	});
});
