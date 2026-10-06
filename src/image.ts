/** Decoded RGBA pixels, shaped like the DOM ImageData the codecs expect. */
export class Pixels {
	readonly colorSpace = 'srgb';

	constructor(
		readonly data: Uint8ClampedArray,
		readonly width: number,
		readonly height: number,
	) {}
}

/** Paints transparent pixels over white, since JPEG has no alpha channel. */
export function flattenOnWhite(image: Pixels): Pixels {
	let opaque = true;
	for (let i = 3; i < image.data.length; i += 4) {
		if (image.data[i] !== 255) {
			opaque = false;
			break;
		}
	}
	if (opaque) {
		return image;
	}
	const out = new Uint8ClampedArray(image.data.length);
	for (let i = 0; i < out.length; i += 4) {
		const alpha = image.data[i + 3] / 255;
		out[i] = image.data[i] * alpha + 255 * (1 - alpha);
		out[i + 1] = image.data[i + 1] * alpha + 255 * (1 - alpha);
		out[i + 2] = image.data[i + 2] * alpha + 255 * (1 - alpha);
		out[i + 3] = 255;
	}
	return new Pixels(out, image.width, image.height);
}

/** Reads the EXIF orientation (1 to 8) of a JPEG, or 1 when absent or malformed. */
export function jpegOrientation(buffer: Uint8Array): number {
	try {
		return readJpegOrientation(buffer);
	} catch {
		// A truncated or damaged header: show the image as stored.
		return 1;
	}
}

function readJpegOrientation(buffer: Uint8Array): number {
	if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
		return 1;
	}
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	let offset = 2;
	while (offset + 4 <= view.byteLength) {
		if (view.getUint8(offset) !== 0xff) {
			return 1;
		}
		const marker = view.getUint8(offset + 1);
		if (marker === 0xda || marker === 0xd9) {
			return 1;
		}
		const length = view.getUint16(offset + 2);
		if (marker === 0xe1 && length >= 16 && view.getUint32(offset + 4) === 0x45786966) {
			return tiffOrientation(view, offset + 10, Math.min(offset + 2 + length, view.byteLength));
		}
		offset += 2 + length;
	}
	return 1;
}

function tiffOrientation(view: DataView, start: number, end: number): number {
	if (start + 8 > end) {
		return 1;
	}
	const little = view.getUint16(start) === 0x4949;
	if (!little && view.getUint16(start) !== 0x4d4d) {
		return 1;
	}
	const ifd = start + view.getUint32(start + 4, little);
	if (ifd + 2 > end) {
		return 1;
	}
	const entries = view.getUint16(ifd, little);
	for (let i = 0; i < entries; i++) {
		const entry = ifd + 2 + i * 12;
		if (entry + 12 > end) {
			return 1;
		}
		if (view.getUint16(entry, little) === 0x0112) {
			const value = view.getUint16(entry + 8, little);
			return value >= 1 && value <= 8 ? value : 1;
		}
	}
	return 1;
}

/** Applies an EXIF orientation so the pixels are stored upright. */
export function applyOrientation(image: Pixels, orientation: number): Pixels {
	if (orientation <= 1 || orientation > 8) {
		return image;
	}
	const { width, height } = image;
	const swap = orientation >= 5;
	const outWidth = swap ? height : width;
	const outHeight = swap ? width : height;
	const out = new Uint8ClampedArray(image.data.length);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let nx: number;
			let ny: number;
			switch (orientation) {
				case 2: nx = width - 1 - x; ny = y; break;
				case 3: nx = width - 1 - x; ny = height - 1 - y; break;
				case 4: nx = x; ny = height - 1 - y; break;
				case 5: nx = y; ny = x; break;
				case 6: nx = height - 1 - y; ny = x; break;
				case 7: nx = height - 1 - y; ny = width - 1 - x; break;
				default: nx = y; ny = width - 1 - x; break;
			}
			const from = (y * width + x) * 4;
			const to = (ny * outWidth + nx) * 4;
			out[to] = image.data[from];
			out[to + 1] = image.data[from + 1];
			out[to + 2] = image.data[from + 2];
			out[to + 3] = image.data[from + 3];
		}
	}
	return new Pixels(out, outWidth, outHeight);
}
