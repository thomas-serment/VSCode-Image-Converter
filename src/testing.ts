// Helpers shared by the tests only; never imported by the extension.

import { encode } from './codecs';
import { Pixels } from './image';

export const SAMPLE_WIDTH = 32;
export const SAMPLE_HEIGHT = 16;
const W = SAMPLE_WIDTH;
const H = SAMPLE_HEIGHT;

export function jpegWithOrientation(orientation: number): Uint8Array {
	const tiff = Buffer.alloc(8 + 2 + 12 + 4);
	tiff.write('II', 0, 'latin1');
	tiff.writeUInt16LE(0x2a, 2);
	tiff.writeUInt32LE(8, 4);
	tiff.writeUInt16LE(1, 8);
	tiff.writeUInt16LE(0x0112, 10);
	tiff.writeUInt16LE(3, 12);
	tiff.writeUInt32LE(1, 14);
	tiff.writeUInt16LE(orientation, 18);
	const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
	const header = Buffer.from([0xff, 0xe1, 0, 0]);
	header.writeUInt16BE(exif.length + 2, 2);
	return Buffer.concat([Buffer.from([0xff, 0xd8]), header, exif, Buffer.from([0xff, 0xd9])]);
}


// Left half red, right half blue, fully opaque.
export function sample(): Pixels {
	const data = new Uint8ClampedArray(W * H * 4);
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const i = (y * W + x) * 4;
			data[i] = x < W / 2 ? 230 : 20;
			data[i + 1] = 20;
			data[i + 2] = x < W / 2 ? 20 : 230;
			data[i + 3] = 255;
		}
	}
	return new Pixels(data, W, H);
}

export async function buildInputs(): Promise<Record<string, { file: string; data: Uint8Array }>> {
	const pixels = sample();
	const rgba = Buffer.from(pixels.data);
	const bmp = require('bmp-js') as { encode(image: { data: Buffer; width: number; height: number }): { data: Buffer } };
	const abgr = Buffer.alloc(rgba.length);
	for (let i = 0; i < rgba.length; i += 4) {
		abgr[i] = rgba[i + 3];
		abgr[i + 1] = rgba[i + 2];
		abgr[i + 2] = rgba[i + 1];
		abgr[i + 3] = rgba[i];
	}
	const { GifWriter } = require('omggif') as { GifWriter: new (out: number[], w: number, h: number, opts: { palette: number[] }) => { addFrame(x: number, y: number, w: number, h: number, indexed: number[]): void; end(): number } };
	const gifBytes: number[] = [];
	const gif = new GifWriter(gifBytes, W, H, { palette: [0xe61414, 0x1414e6] });
	gif.addFrame(0, 0, W, H, Array.from({ length: W * H }, (_, i) => (i % W < W / 2 ? 0 : 1)));
	gif.end();
	const UTIF = require('utif2') as { encodeImage(rgba: Uint8Array, w: number, h: number): ArrayBuffer };
	const png = Buffer.from(await encode('png', pixels, 90));
	const ico = Buffer.alloc(22);
	ico.writeUInt16LE(1, 2);
	ico.writeUInt16LE(1, 4);
	ico.writeUInt16LE(1, 10);
	ico.writeUInt16LE(32, 12);
	ico.writeUInt32LE(png.length, 14);
	ico.writeUInt32LE(22, 18);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W / 2}" height="${H}" fill="#e61414"/><rect x="${W / 2}" width="${W / 2}" height="${H}" fill="#1414e6"/></svg>`;
	return {
		png: { file: 'a.png', data: png },
		jpeg: { file: 'a.jpg', data: await encode('jpg', pixels, 95) },
		webp: { file: 'a.webp', data: await encode('webp', pixels, 95) },
		bmp: { file: 'a.bmp', data: bmp.encode({ data: abgr, width: W, height: H }).data },
		gif: { file: 'a.gif', data: Uint8Array.from(gifBytes) },
		tiff: { file: 'a.tiff', data: new Uint8Array(UTIF.encodeImage(rgba, W, H)) },
		ico: { file: 'a.ico', data: Buffer.concat([ico, png]) },
		svg: { file: 'a.svg', data: Buffer.from(svg) },
	};
}

