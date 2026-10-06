import * as path from 'node:path';

export type InputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'heic' | 'bmp' | 'tiff' | 'gif' | 'ico' | 'svg';
export type OutputFormat = 'jpg' | 'png' | 'webp';

export const OUTPUT_FORMATS: readonly { format: OutputFormat; label: string }[] = [
	{ format: 'webp', label: 'WebP' },
	{ format: 'jpg', label: 'JPG' },
	{ format: 'png', label: 'PNG' },
];

const EXTENSIONS: Readonly<Record<string, InputFormat>> = {
	'.jpg': 'jpeg',
	'.jpeg': 'jpeg',
	'.jpe': 'jpeg',
	'.png': 'png',
	'.apng': 'png',
	'.webp': 'webp',
	'.avif': 'avif',
	'.heic': 'heic',
	'.heif': 'heic',
	'.bmp': 'bmp',
	'.tif': 'tiff',
	'.tiff': 'tiff',
	'.gif': 'gif',
	'.ico': 'ico',
	'.svg': 'svg',
};

/** True when the file extension is one the extension can convert. */
export function isImagePath(file: string): boolean {
	return Object.hasOwn(EXTENSIONS, path.extname(file).toLowerCase());
}

const startsWith = (buffer: Uint8Array, bytes: number[], offset = 0): boolean =>
	buffer.length >= offset + bytes.length && bytes.every((byte, i) => buffer[offset + i] === byte);

const ascii = (buffer: Uint8Array, start: number, end: number): string =>
	Buffer.from(buffer.subarray(start, end)).toString('latin1');

/** Finds the real format from the first bytes, falling back to the extension. */
export function detectFormat(buffer: Uint8Array, file: string): InputFormat | undefined {
	if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
		return 'jpeg';
	}
	if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) {
		return 'png';
	}
	if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) {
		return 'gif';
	}
	if (startsWith(buffer, [0x42, 0x4d])) {
		return 'bmp';
	}
	if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') {
		return 'webp';
	}
	if (startsWith(buffer, [0x49, 0x49, 0x2a, 0x00]) || startsWith(buffer, [0x4d, 0x4d, 0x00, 0x2a])) {
		return 'tiff';
	}
	if (startsWith(buffer, [0x00, 0x00, 0x01, 0x00])) {
		return 'ico';
	}
	if (ascii(buffer, 4, 8) === 'ftyp') {
		// Major brand, then the compatible brands listed in the rest of the ftyp box.
		const boxEnd = Math.min(buffer.length, new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(0));
		const brands = [ascii(buffer, 8, 12)];
		for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
			brands.push(ascii(buffer, offset, offset + 4));
		}
		return brands.some((brand) => brand === 'avif' || brand === 'avis') ? 'avif' : 'heic';
	}
	const byExtension = EXTENSIONS[path.extname(file).toLowerCase()];
	if (byExtension === 'svg' && ascii(buffer, 0, Math.min(buffer.length, 4096)).includes('<svg')) {
		return 'svg';
	}
	return undefined;
}
