import { rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as vscode from 'vscode';
import { collectImages, outputFolderName, uniqueOutputPath } from './files';
import { OUTPUT_FORMATS, type OutputFormat } from './formats';
import { WorkerPool } from './pool';

const COMMAND = 'image-converter.convert';
const LAST_FORMAT_KEY = 'lastFormat';

export function activate(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel('Image Converter');
	context.subscriptions.push(
		output,
		vscode.commands.registerCommand(COMMAND, async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
			try {
				await convert(context, output, uri, uris);
			} catch (error) {
				void vscode.window.showErrorMessage(`Image conversion failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		}),
	);
}

export function deactivate(): void {}

async function pickInputs(uri?: vscode.Uri, uris?: vscode.Uri[]): Promise<string[] | undefined> {
	const selected = uris?.length ? uris : uri ? [uri] : await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectFolders: true,
		canSelectMany: true,
		openLabel: 'Convert',
	});
	const local = selected?.filter((item) => item.scheme === 'file');
	return local?.length ? local.map((item) => item.fsPath) : undefined;
}

/** Reads the quality setting, falling back to 95 when it is not a usable number. */
function qualitySetting(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(100, Math.max(1, value))) : 95;
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

async function convert(context: vscode.ExtensionContext, output: vscode.OutputChannel, uri?: vscode.Uri, uris?: vscode.Uri[]): Promise<void> {
	const inputs = await pickInputs(uri, uris);
	if (!inputs) {
		return;
	}
	const settings = vscode.workspace.getConfiguration('imageConverter');
	const quality = qualitySetting(settings.get('quality'));
	const folder = outputFolderName(settings.get<string>('outputFolder'));

	// Look for images before asking for a format, so an empty selection is reported at once.
	const { files, ignored } = await collectImages(inputs, folder);
	for (const file of ignored) {
		output.appendLine(`Skipped (unsupported or unreadable): ${file}`);
	}
	if (files.length === 0) {
		void vscode.window.showWarningMessage('No supported image found in the selection.');
		return;
	}

	const last = context.globalState.get<OutputFormat>(LAST_FORMAT_KEY);
	const items = OUTPUT_FORMATS.map(({ format, label }) => ({ label, format, description: format === last ? 'last used' : undefined }));
	items.sort((a, b) => Number(b.format === last) - Number(a.format === last));
	const choice = await vscode.window.showQuickPick(items, { placeHolder: `Convert ${plural(files.length, 'image')} to which format?` });
	if (!choice) {
		return;
	}
	const format: OutputFormat = choice.format;
	await context.globalState.update(LAST_FORMAT_KEY, format);

	const failures: string[] = [];
	let converted = 0;
	let cancelled = false;
	await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: `Converting to ${choice.label}`, cancellable: true },
		async (progress, token) => {
			const pool = new WorkerPool(Math.max(1, Math.min(2, os.availableParallelism() - 1)));
			const stopped = new Promise<void>((resolve) =>
				token.onCancellationRequested(async () => {
					cancelled = true;
					// Remove the files that were half written when the workers were stopped.
					const interrupted = await pool.dispose();
					await Promise.all(interrupted.map((file) => rm(file, { force: true })));
					resolve();
				}),
			);
			const reserved = new Set<string>();
			let done = 0;
			await Promise.all(
				files.map(async (source) => {
					try {
						const target = await uniqueOutputPath(source, folder, format, reserved);
						await pool.run({ source, output: target, format, quality });
						converted++;
					} catch (error) {
						if (!cancelled) {
							failures.push(`${source}: ${error instanceof Error ? error.message : String(error)}`);
						}
					}
					progress.report({ increment: 100 / files.length, message: `${++done}/${files.length}` });
				}),
			);
			if (cancelled) {
				await stopped;
			} else {
				await pool.dispose();
			}
		},
	);

	for (const failure of failures) {
		output.appendLine(`Failed: ${failure}`);
	}
	if (cancelled) {
		void vscode.window.showInformationMessage(`Cancelled after ${converted} of ${plural(files.length, 'image')}.`);
		return;
	}
	const problems = [
		failures.length > 0 ? `${failures.length} failed` : '',
		ignored.length > 0 ? `${ignored.length} skipped` : '',
	].filter(Boolean);
	const summary = `${converted} of ${plural(files.length, 'image')} converted to ${choice.label} in "${folder}".`;
	if (problems.length > 0) {
		const action = await vscode.window.showWarningMessage(`${summary} ${problems.join(', ')}.`, 'Show Details');
		if (action) {
			output.show();
		}
	} else {
		void vscode.window.showInformationMessage(summary);
	}
}
