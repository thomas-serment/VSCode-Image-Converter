import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { applyOrientation, flattenOnWhite, jpegOrientation, Pixels } from './image';
import type { InputFormat, OutputFormat } from './formats';

// Both the bundle (dist) and the compiled tests (out) sit one level under the extension root.
const wasmDir = path.join(__dirname, '..', 'wasm');
const vendorDir = path.join(__dirname, '..', 'vendor');

const SVG_MIN_SIDE = 1024;
const SVG_MAX_SIDE = 8192;

type Init = (module: WebAssembly.Module) => Promise<unknown>;

function once<T>(load: () => Promise<T>): () => Promise<T> {
	let cached: Promise<T> | undefined;
	return () => (cached ??= load());
}

async function wasmModule(file: string): Promise<WebAssembly.Module> {
	return WebAssembly.compile(await readFile(path.join(wasmDir, file)));
}

// CommonJS packages arrive as `{ default }` when loaded with a native import(), and flat once bundled.
function cjs<T extends object>(loaded: T | { default: T }): T {
	return 'default' in loaded && loaded.default && typeof loaded.default === 'object' ? (loaded.default as T) : (loaded as T);
}

const toPixels = (image: { data: Uint8ClampedArray; width: number; height: number }): Pixels =>
	new Pixels(image.data, image.width, image.height);

// Each codec is loaded the first time a file needs it.
const jpegDecode = once(async () => {
	const codec = await import('@jsquash/jpeg/decode.js');
	await (codec.init as unknown as Init)(await wasmModule('mozjpeg_dec.wasm'));
	return codec.default;
});
const jpegEncode = once(async () => {
	const codec = await import('@jsquash/jpeg/encode.js');
	await (codec.init as unknown as Init)(await wasmModule('mozjpeg_enc.wasm'));
	return codec.default;
});
const pngDecode = once(async () => {
	const codec = await import('@jsquash/png/decode.js');
	await (codec.init as unknown as Init)(await wasmModule('squoosh_png_bg.wasm'));
	return codec.default;
});
const pngEncode = once(async () => {
	const codec = await import('@jsquash/png/encode.js');
	await (codec.init as unknown as Init)(await wasmModule('squoosh_png_bg.wasm'));
	return codec.default;
});
const webpDecode = once(async () => {
	const codec = await import('@jsquash/webp/decode.js');
	await (codec.init as unknown as Init)(await wasmModule('webp_dec.wasm'));
	return codec.default;
});
const webpEncode = once(async () => {
	const codec = await import('@jsquash/webp/encode.js');
	await (codec.init as unknown as Init)(await wasmModule('webp_enc.wasm'));
	return codec.default;
});
const avifDecode = once(async () => {
	const codec = await import('@jsquash/avif/decode.js');
	await (codec.init as unknown as Init)(await wasmModule('avif_dec.wasm'));
	return codec.default;
});
const resvg = once(async () => {
	const codec = await import('@resvg/resvg-wasm');
	await codec.initWasm(await readFile(path.join(wasmDir, 'resvg.wasm')));
	return codec;
});

interface HeifImage {
	get_width(): number;
	get_height(): number;
	is_primary(): boolean;
	display(target: Pixels, done: (result: unknown) => void): void;
	free(): void;
}
interface HeifDecoder {
	decode(buffer: Uint8Array): HeifImage[];
}
interface Libheif {
	HeifDecoder: new () => HeifDecoder;
}
// libheif-js is LGPL-3.0, so it is shipped as a separate unmodified file and loaded at runtime.
// One decoder is reused: each decode() frees the file the previous one kept in memory.
const heifDecoder = once(async (): Promise<HeifDecoder> => {
	const factory = require(path.join(vendorDir, 'libheif-bundle.js')) as () => Libheif;
	return new (factory().HeifDecoder)();
});

type CodecImage = Parameters<Awaited<ReturnType<typeof jpegEncode>>>[0];

// Codecs take an ArrayBuffer: reuse the file's own buffer when it holds exactly the file.
const arrayBuffer = (data: Uint8Array): ArrayBuffer =>
	(data.byteOffset === 0 && data.byteLength === data.buffer.byteLength ? data.buffer : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)) as ArrayBuffer;

async function required<T>(result: Promise<T | null | undefined>, what: string): Promise<T> {
	const value = await result;
	if (!value) {
		throw new Error(`Could not decode the ${what} image.`);
	}
	return value;
}

const decoders: Record<InputFormat, (data: Uint8Array) => Promise<Pixels>> = {
	async jpeg(data) {
		const decode = await jpegDecode();
		return applyOrientation(toPixels(await decode(arrayBuffer(data))), jpegOrientation(data));
	},
	async png(data) {
		const decode = await pngDecode();
		return toPixels(await decode(arrayBuffer(data)));
	},
	async webp(data) {
		const decode = await webpDecode();
		return toPixels(await decode(arrayBuffer(data)));
	},
	async avif(data) {
		const decode = await avifDecode();
		return toPixels(await required(decode(arrayBuffer(data)), 'AVIF'));
	},
	async heic(data) {
		const images = (await heifDecoder()).decode(data);
		try {
			const image = images.find((candidate) => candidate.is_primary()) ?? images[0];
			if (!image) {
				throw new Error('Could not decode the HEIC image.');
			}
			const width = image.get_width();
			const height = image.get_height();
			const target = new Pixels(new Uint8ClampedArray(width * height * 4), width, height);
			await new Promise<void>((resolve, reject) =>
				image.display(target, (result) => (result ? resolve() : reject(new Error('Could not decode the HEIC image.')))),
			);
			return target;
		} finally {
			for (const image of images) {
				image.free();
			}
		}
	},
	async bmp(data) {
		const bmp = cjs(await import('bmp-js'));
		const decoded = bmp.decode(data);
		const out = new Uint8ClampedArray(decoded.width * decoded.height * 4);
		let hasAlpha = false;
		if (decoded.bitPP === 32) {
			for (let i = 0; i < out.length; i += 4) {
				if (decoded.data[i] !== 0) {
					hasAlpha = true;
					break;
				}
			}
		}
		// bmp-js returns ABGR; many 32-bit BMP files leave the alpha byte at zero.
		for (let i = 0; i < out.length; i += 4) {
			out[i] = decoded.data[i + 3];
			out[i + 1] = decoded.data[i + 2];
			out[i + 2] = decoded.data[i + 1];
			out[i + 3] = hasAlpha ? decoded.data[i] : 255;
		}
		return new Pixels(out, decoded.width, decoded.height);
	},
	async tiff(data) {
		const UTIF = cjs(await import('utif2'));
		const buffer = arrayBuffer(data);
		const [page] = UTIF.decode(buffer);
		if (!page) {
			throw new Error('Could not decode the TIFF image.');
		}
		UTIF.decodeImage(buffer, page);
		return new Pixels(new Uint8ClampedArray(UTIF.toRGBA8(page)), page.width, page.height);
	},
	async gif(data) {
		const { GifReader } = cjs(await import('omggif'));
		const reader = new GifReader(data);
		const pixels = new Uint8ClampedArray(reader.width * reader.height * 4);
		reader.decodeAndBlitFrameRGBA(0, pixels);
		return new Pixels(pixels, reader.width, reader.height);
	},
	async ico(data) {
		const { default: decodeIco } = await import('decode-ico');
		const images = decodeIco(data);
		const largest = images.reduce((best, image) => (image.width * image.height > best.width * best.height ? image : best));
		if (largest.type === 'png') {
			return decoders.png(new Uint8Array(largest.data));
		}
		return new Pixels(new Uint8ClampedArray(largest.data), largest.width, largest.height);
	},
	async svg(data) {
		const { Resvg } = await resvg();
		const svg = Buffer.from(data).toString('utf8');
		const probe = new Resvg(svg);
		const [width, height] = [probe.width, probe.height];
		probe.free();
		// Vector images have no pixel size: render them large enough to stay sharp.
		const side = Math.max(width, height);
		const target = Math.min(Math.max(side, SVG_MIN_SIDE), SVG_MAX_SIDE);
		const fitTo = width >= height ? { mode: 'width' as const, value: Math.round((width * target) / side) } : { mode: 'height' as const, value: Math.round((height * target) / side) };
		const rendered = new Resvg(svg, { fitTo }).render();
		const image = new Pixels(new Uint8ClampedArray(rendered.pixels), rendered.width, rendered.height);
		rendered.free();
		return image;
	},
};

export function decode(format: InputFormat, data: Uint8Array): Promise<Pixels> {
	return decoders[format](data);
}

export async function encode(format: OutputFormat, image: Pixels, quality: number): Promise<Uint8Array> {
	// The codecs only read `data`, `width` and `height`, which Pixels provides.
	const source = image as unknown as CodecImage;
	switch (format) {
		case 'jpg': {
			const encodeJpeg = await jpegEncode();
			return new Uint8Array(await encodeJpeg(flattenOnWhite(image) as unknown as CodecImage, { quality }));
		}
		case 'png': {
			const encodePng = await pngEncode();
			return new Uint8Array(await encodePng(source));
		}
		case 'webp': {
			const encodeWebp = await webpEncode();
			return new Uint8Array(await encodeWebp(source, { quality }));
		}
	}
}
