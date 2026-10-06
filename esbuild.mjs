import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const production = process.argv.includes('--production');

// The WebAssembly codecs are loaded from disk at runtime, so only the needed files are shipped.
const wasmFiles = [
	['node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', 'mozjpeg_dec.wasm'],
	['node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm', 'mozjpeg_enc.wasm'],
	['node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm', 'squoosh_png_bg.wasm'],
	['node_modules/@jsquash/webp/codec/dec/webp_dec.wasm', 'webp_dec.wasm'],
	['node_modules/@jsquash/webp/codec/enc/webp_enc.wasm', 'webp_enc.wasm'],
	['node_modules/@jsquash/avif/codec/dec/avif_dec.wasm', 'avif_dec.wasm'],
	['node_modules/@resvg/resvg-wasm/index_bg.wasm', 'resvg.wasm'],
];

await Promise.all([rm('wasm', { recursive: true, force: true }), rm('vendor', { recursive: true, force: true })]);
await Promise.all([mkdir('wasm', { recursive: true }), mkdir('vendor', { recursive: true })]);
await Promise.all(wasmFiles.map(([from, to]) => cp(from, `wasm/${to}`)));

// libheif-js is LGPL-3.0: it stays a separate, unmodified file instead of being bundled.
await cp('node_modules/libheif-js/libheif-wasm/libheif-bundle.js', 'vendor/libheif-bundle.js');

// Licenses of every package shipped in the VSIX, gathered in one notices file.
const shipped = ['@jsquash/avif', '@jsquash/jpeg', '@jsquash/png', '@jsquash/webp', '@resvg/resvg-wasm', 'bmp-js', 'decode-ico', 'libheif-js', 'omggif', 'utif2'];
const notices = [];
for (const name of shipped) {
	const dir = `node_modules/${name}`;
	const { version, license, repository } = JSON.parse(await readFile(`${dir}/package.json`, 'utf8'));
	const url = typeof repository === 'string' ? repository : repository?.url ?? '';
	const file = (await readdir(dir)).find((entry) => /^licen[cs]e/i.test(entry));
	let text = file ? await readFile(`${dir}/${file}`, 'utf8') : '';
	if (!text && name === 'omggif') {
		// omggif keeps its MIT notice in the source header, which minification removes.
		text = (await readFile(`${dir}/omggif.js`, 'utf8')).split('\n').filter((line) => line.startsWith('//')).slice(0, 25).map((line) => line.replace(/^\/\/ ?/, '')).join('\n');
	}
	notices.push(`${name} ${version} (${license})\n${url}\n\n${text.trim() || `Licensed under ${license}.`}\n`);
}
await writeFile('THIRD-PARTY-NOTICES.txt', notices.join(`\n${'-'.repeat(72)}\n\n`));

await build({
	entryPoints: { extension: 'src/extension.ts', worker: 'src/worker.ts' },
	outdir: 'dist',
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node22',
	external: ['vscode'],
	minify: production,
	sourcemap: !production,
	logLevel: 'warning',
	// Some codecs build their own file URLs from import.meta.url, which does not exist in a CommonJS bundle.
	banner: { js: "const import_meta_url = require('node:url').pathToFileURL(__filename).href;" },
	define: { 'import.meta.url': 'import_meta_url' },
});
