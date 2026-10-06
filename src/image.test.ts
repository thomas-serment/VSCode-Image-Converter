import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { jpegWithOrientation } from './testing';
import { applyOrientation, flattenOnWhite, jpegOrientation, Pixels } from './image';

// 2 columns x 3 rows, each pixel tagged by its index in the red channel.
function tagged(): Pixels {
	const data = new Uint8ClampedArray(2 * 3 * 4);
	for (let i = 0; i < 6; i++) {
		data[i * 4] = i;
		data[i * 4 + 3] = 255;
	}
	return new Pixels(data, 2, 3);
}

const reds = (image: Pixels): number[] => Array.from({ length: image.width * image.height }, (_, i) => image.data[i * 4]);

test('jpegOrientation reads the EXIF orientation', () => {
	for (let orientation = 1; orientation <= 8; orientation++) {
		assert.equal(jpegOrientation(jpegWithOrientation(orientation)), orientation);
	}
});

test('jpegOrientation falls back to 1 on missing or malformed data', () => {
	assert.equal(jpegOrientation(Buffer.from('not a jpeg')), 1);
	assert.equal(jpegOrientation(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), 1);
	assert.equal(jpegOrientation(jpegWithOrientation(9)), 1);
	assert.equal(jpegOrientation(jpegWithOrientation(6).subarray(0, 14)), 1);
	assert.equal(jpegOrientation(new Uint8Array(0)), 1);
});

test('applyOrientation turns the pixels upright for every EXIF value', () => {
	// Original layout:  0 1 / 2 3 / 4 5
	const expected: Record<number, { size: [number, number]; reds: number[] }> = {
		1: { size: [2, 3], reds: [0, 1, 2, 3, 4, 5] },
		2: { size: [2, 3], reds: [1, 0, 3, 2, 5, 4] },
		3: { size: [2, 3], reds: [5, 4, 3, 2, 1, 0] },
		4: { size: [2, 3], reds: [4, 5, 2, 3, 0, 1] },
		5: { size: [3, 2], reds: [0, 2, 4, 1, 3, 5] },
		6: { size: [3, 2], reds: [4, 2, 0, 5, 3, 1] },
		7: { size: [3, 2], reds: [5, 3, 1, 4, 2, 0] },
		8: { size: [3, 2], reds: [1, 3, 5, 0, 2, 4] },
	};
	for (const [orientation, want] of Object.entries(expected)) {
		const result = applyOrientation(tagged(), Number(orientation));
		assert.deepEqual([result.width, result.height], want.size, `size for ${orientation}`);
		assert.deepEqual(reds(result), want.reds, `pixels for ${orientation}`);
	}
});

test('flattenOnWhite leaves opaque images untouched', () => {
	const image = tagged();
	assert.equal(flattenOnWhite(image), image);
});

test('flattenOnWhite blends transparency over white', () => {
	const image = new Pixels(new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 128]), 3, 1);
	const flat = flattenOnWhite(image);
	assert.deepEqual(Array.from(flat.data.subarray(0, 4)), [255, 255, 255, 255]);
	assert.deepEqual(Array.from(flat.data.subarray(4, 8)), [255, 0, 0, 255]);
	assert.equal(flat.data[8], 127);
	assert.equal(flat.data[11], 255);
});
