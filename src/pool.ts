import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { Job, Result } from './worker';

interface Pending {
	resolve: () => void;
	reject: (error: Error) => void;
}

/** A small pool of workers, each converting one image at a time. */
export class WorkerPool {
	private readonly idle: Worker[] = [];
	private readonly queue: { job: Job; pending: Pending }[] = [];
	private readonly running = new Map<Worker, { output: string; pending: Pending }>();
	private disposed = false;

	constructor(private readonly size: number) {}

	run(job: Omit<Job, 'id'>): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.disposed) {
				reject(new Error('Cancelled.'));
				return;
			}
			this.queue.push({ job: { ...job, id: this.nextId++ }, pending: { resolve, reject } });
			this.pump();
		});
	}

	/** Stops every worker and rejects unfinished jobs. Resolves with the outputs that were being written. */
	async dispose(): Promise<string[]> {
		this.disposed = true;
		const workers = [...this.idle, ...this.running.keys()];
		const interrupted = [...this.running.values()];
		this.idle.length = 0;
		this.running.clear();
		for (const { pending } of [...interrupted, ...this.queue.splice(0)]) {
			pending.reject(new Error('Cancelled.'));
		}
		await Promise.all(workers.map((worker) => worker.terminate()));
		return interrupted.map(({ output }) => output);
	}

	private nextId = 0;
	private created = 0;

	private pump(): void {
		while (!this.disposed && this.queue.length > 0) {
			const worker = this.idle.pop() ?? (this.created < this.size ? this.spawn() : undefined);
			const next = this.queue.shift();
			if (!worker || !next) {
				if (worker) {
					this.idle.push(worker);
				}
				if (next) {
					this.queue.unshift(next);
				}
				return;
			}
			this.running.set(worker, { output: next.job.output, pending: next.pending });
			worker.postMessage(next.job);
		}
	}

	private spawn(): Worker {
		this.created++;
		const worker = new Worker(path.join(__dirname, 'worker.js'));
		worker.on('message', (result: Result) => {
			const current = this.running.get(worker);
			this.running.delete(worker);
			this.idle.push(worker);
			if (current && result.error) {
				current.pending.reject(new Error(result.error));
			} else {
				current?.pending.resolve();
			}
			this.pump();
		});
		worker.on('error', (error) => {
			const current = this.running.get(worker);
			this.running.delete(worker);
			this.created--;
			current?.pending.reject(error);
			this.pump();
		});
		worker.on('exit', () => {
			const current = this.running.get(worker);
			if (current) {
				this.running.delete(worker);
				this.created--;
				current.pending.reject(new Error('The conversion worker stopped unexpectedly.'));
				this.pump();
			}
		});
		return worker;
	}
}
