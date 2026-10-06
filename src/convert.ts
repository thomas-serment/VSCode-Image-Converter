import { decode, encode } from './codecs';
import { detectFormat, type OutputFormat } from './formats';

/** Images above this size are refused instead of exhausting the memory of the worker. */
export const MAX_PIXELS = 150_000_000;
export const MAX_INPUT_BYTES = 256 * 1024 * 1024;

/** Converts one image file's bytes to the target format. `file` is only used to detect SVG. */
export async function convertImage(input: Uint8Array, file: string, target: OutputFormat, quality: number): Promise<Uint8Array> {
	if (input.length > MAX_INPUT_BYTES) {
		throw new Error('File is larger than 256 MB.');
	}
	const format = detectFormat(input, file);
	if (!format) {
		throw new Error('Unsupported or corrupted image.');
	}
	const pixels = await decode(format, input);
	if (pixels.width * pixels.height > MAX_PIXELS) {
		throw new Error('Image is larger than 150 megapixels.');
	}
	return encode(target, pixels, quality);
}
