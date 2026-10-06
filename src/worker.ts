import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parentPort } from 'node:worker_threads';
import { convertImage, MAX_INPUT_BYTES } from './convert';
import type { OutputFormat } from './formats';

export interface Job {
	id: number;
	source: string;
	output: string;
	format: OutputFormat;
	quality: number;
}

export type Result = { id: number; error?: string };

// Decoding and encoding run here so the extension host stays responsive.
parentPort?.on('message', async (job: Job) => {
	const result: Result = { id: job.id };
	try {
		// Check the size first, so a huge file is never read into memory.
		if ((await stat(job.source)).size > MAX_INPUT_BYTES) {
			throw new Error('File is larger than 256 MB.');
		}
		const converted = await convertImage(await readFile(job.source), job.source, job.format, job.quality);
		await mkdir(path.dirname(job.output), { recursive: true });
		await writeFile(job.output, converted, { flag: 'wx' });
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}
	parentPort?.postMessage(result);
});
