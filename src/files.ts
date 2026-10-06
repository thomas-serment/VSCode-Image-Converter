import { access, lstat, readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { isImagePath, type OutputFormat } from './formats';

const SKIPPED_FOLDERS = new Set(['node_modules']);

/** Keeps only a plain folder name, so the setting cannot point outside the source folder. */
export function outputFolderName(setting: string | undefined): string {
	const name = path.basename((setting ?? '').trim());
	return name && name !== '.' && name !== '..' ? name : 'converted';
}

/** Expands files and folders (recursively) into the list of images to convert. `ignored` lists what could not be used. */
export async function collectImages(inputs: readonly string[], outputFolder: string): Promise<{ files: string[]; ignored: string[] }> {
	const files = new Set<string>();
	const ignored: string[] = [];

	async function visit(entry: string, explicit: boolean): Promise<void> {
		let stats;
		try {
			// Links are followed only when picked by hand, so a folder walk cannot loop.
			stats = explicit ? await stat(entry) : await lstat(entry);
		} catch {
			ignored.push(entry);
			return;
		}
		if (stats.isSymbolicLink()) {
			return;
		}
		if (stats.isDirectory()) {
			const name = path.basename(entry);
			if (!explicit && (name.startsWith('.') || name === outputFolder || SKIPPED_FOLDERS.has(name))) {
				return;
			}
			let children: string[];
			try {
				children = (await readdir(entry)).sort();
			} catch {
				ignored.push(entry);
				return;
			}
			for (const child of children) {
				await visit(path.join(entry, child), false);
			}
		} else if (stats.isFile()) {
			if (isImagePath(entry)) {
				files.add(entry);
			} else if (explicit) {
				ignored.push(entry);
			}
		}
	}

	for (const input of inputs) {
		await visit(input, true);
	}
	return { files: [...files], ignored };
}

const exists = (file: string): Promise<boolean> => access(file).then(() => true, () => false);

/** Picks `<dir>/<outputFolder>/<name>.<format>`, adding " (1)", " (2)"... instead of overwriting. */
export async function uniqueOutputPath(source: string, outputFolder: string, format: OutputFormat, reserved: Set<string>): Promise<string> {
	const { dir, name } = path.parse(source);
	const folder = path.join(dir, outputFolder);
	for (let n = 0; ; n++) {
		const candidate = path.join(folder, n === 0 ? `${name}.${format}` : `${name} (${n}).${format}`);
		if (reserved.has(candidate)) {
			continue;
		}
		// Reserve before awaiting, so parallel calls never pick the same name.
		reserved.add(candidate);
		if (!(await exists(candidate))) {
			return candidate;
		}
	}
}
