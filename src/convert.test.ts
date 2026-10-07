import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { decode, encode } from './codecs';
import { convertImage } from './convert';
import type { InputFormat, OutputFormat } from './formats';
import { applyOrientation, Pixels } from './image';
import { buildInputs, jpegWithOrientation, sample, SAMPLE_HEIGHT, SAMPLE_WIDTH } from './testing';

const W = SAMPLE_WIDTH;
const H = SAMPLE_HEIGHT;

const rgbAt = (image: Pixels, x: number, y: number): number[] => Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 3));

function assertSample(image: Pixels, label: string): void {
	assert.deepEqual([image.width, image.height], [W, H], `${label}: size`);
	const left = rgbAt(image, 4, 8);
	const right = rgbAt(image, W - 5, 8);
	assert.ok(left[0] > 190 && left[2] < 70, `${label}: left half should be red, got ${left}`);
	assert.ok(right[2] > 190 && right[0] < 70, `${label}: right half should be blue, got ${right}`);
}

test('every supported input format converts to JPG, PNG and WebP', async () => {
	const inputs = await buildInputs();
	for (const [format, { file, data }] of Object.entries(inputs)) {
		for (const target of ['jpg', 'png', 'webp'] as OutputFormat[]) {
			const converted = await convertImage(data, file, target, 90);
			const inputFormat: InputFormat = target === 'jpg' ? 'jpeg' : target;
			const roundTrip = await decode(inputFormat, converted);
			const label = `${format} -> ${target}`;
			if (format === 'svg') {
				// Vector images are rendered at least 1024 px wide, keeping the aspect ratio.
				assert.deepEqual([roundTrip.width, roundTrip.height], [1024, 512], `${label}: size`);
				assert.ok(rgbAt(roundTrip, 100, 250)[0] > 190, `${label}: left half should be red`);
			} else {
				assertSample(roundTrip, label);
			}
		}
	}
});

test('output files are real JPG, PNG and WebP files', async () => {
	const { png } = await buildInputs();
	const magic = async (target: OutputFormat): Promise<string> => Buffer.from(await convertImage(png.data, png.file, target, 90)).subarray(0, 12).toString('latin1');
	assert.ok((await magic('png')).startsWith('\x89PNG'));
	assert.ok((await magic('jpg')).startsWith('\xff\xd8\xff'));
	const webp = await magic('webp');
	assert.ok(webp.startsWith('RIFF') && webp.slice(8, 12) === 'WEBP');
});

test('AVIF files are decoded', async () => {
	const avif = await import('@jsquash/avif/encode.js');
	const { readFile: read } = await import('node:fs/promises');
	const wasm = await WebAssembly.compile(await read(require.resolve('@jsquash/avif/codec/enc/avif_enc.wasm')));
	await (avif.init as unknown as (module: WebAssembly.Module) => Promise<unknown>)(wasm);
	const data = await avif.default(sample() as unknown as Parameters<typeof avif.default>[0], { quality: 80 });
	const converted = await convertImage(new Uint8Array(data), 'a.avif', 'png', 90);
	const roundTrip = await decode('png', converted);
	assert.deepEqual([roundTrip.width, roundTrip.height], [W, H]);
	assert.ok(rgbAt(roundTrip, 4, 8)[0] > 150);
});

test('JPEG photos are turned upright using their EXIF orientation', async () => {
	const jpeg = Buffer.from(await encode('jpg', sample(), 95));
	// Insert an EXIF block saying "rotate 90 degrees clockwise" right after the JPEG start marker.
	const exif = jpegWithOrientation(6).subarray(2, -2);
	const rotated = Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]);
	const converted = await convertImage(rotated, 'photo.jpg', 'png', 90);
	const result = await decode('png', converted);
	assert.deepEqual([result.width, result.height], [H, W]);
	const expected = applyOrientation(sample(), 6);
	assert.deepEqual([expected.width, expected.height], [H, W]);
	assert.ok(rgbAt(result, 8, 4)[0] > 190, 'top of the rotated image is the red half');
	assert.ok(rgbAt(result, 8, W - 5)[2] > 190, 'bottom of the rotated image is the blue half');
});

test('JPG output keeps fine detail at the default quality', async () => {
	// Noise, a gradient and thin diagonal lines: the kind of detail a soft encoder smears.
	const width = 256;
	const data = new Uint8ClampedArray(width * width * 4);
	let seed = 12345;
	const noise = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 40;
	for (let y = 0; y < width; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			const line = (x + y) % 9 === 0 ? 90 : 0;
			const n = noise();
			data.set([Math.min(255, x + n + line), Math.min(255, y + n - line / 2), Math.min(255, 128 + 60 * Math.sin(x / 7) + n), 255], i);
		}
	}
	const original = new Pixels(data, width, width);
	const back = await decode('jpeg', await encode('jpg', original, 92));
	let squares = 0;
	for (let i = 0; i < data.length; i += 4) {
		for (let c = 0; c < 3; c++) {
			squares += (data[i + c] - back.data[i + c]) ** 2;
		}
	}
	const psnr = 10 * Math.log10(255 ** 2 / (squares / (width * width * 3)));
	// The softer default quantization table of mozjpeg gives about 31 dB here, the standard one 33.6 dB.
	assert.ok(psnr > 33, `fidelity should stay above 33 dB, got ${psnr.toFixed(1)}`);
});

test('transparent images get a white background when saved as JPG', async () => {
	const transparent = new Pixels(new Uint8ClampedArray(W * H * 4), W, H);
	const png = await encode('png', transparent, 90);
	const jpg = await decode('jpeg', await convertImage(png, 'a.png', 'jpg', 90));
	assert.ok(rgbAt(jpg, 8, 8).every((value) => value > 245));
});

test('corrupted or unsupported files are rejected with a clear error', async () => {
	await assert.rejects(convertImage(Buffer.from('hello world'), 'a.png', 'png', 90), /Unsupported or corrupted/);
	await assert.rejects(convertImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]), 'a.png', 'webp', 90));
	await assert.rejects(convertImage(Buffer.from('<html/>'), 'a.svg', 'png', 90), /Unsupported or corrupted/);
});

test('the shipped WebAssembly files exist', async () => {
	for (const file of ['mozjpeg_dec', 'mozjpeg_enc', 'webp_dec', 'webp_enc', 'avif_dec', 'resvg', 'squoosh_png_bg']) {
		assert.ok((await readFile(`${__dirname}/../wasm/${file}.wasm`)).length > 1000, file);
	}
});
