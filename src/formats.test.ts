import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectFormat, isImagePath } from './formats';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const ftyp = (brand: string): Uint8Array => Buffer.concat([bytes(0, 0, 0, 24), Buffer.from(`ftyp${brand}`, 'latin1'), Buffer.alloc(12)]);

test('detectFormat recognises images from their first bytes, whatever the file name', () => {
	assert.equal(detectFormat(bytes(0xff, 0xd8, 0xff, 0xe0), 'photo.png'), 'jpeg');
	assert.equal(detectFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d), 'x.jpg'), 'png');
	assert.equal(detectFormat(Buffer.from('GIF89a'), 'x.bin'), 'gif');
	assert.equal(detectFormat(Buffer.from('BM\0\0\0\0'), 'x.bin'), 'bmp');
	assert.equal(detectFormat(Buffer.from('RIFF\0\0\0\0WEBPVP8 '), 'x.bin'), 'webp');
	assert.equal(detectFormat(bytes(0x49, 0x49, 0x2a, 0x00), 'x.bin'), 'tiff');
	assert.equal(detectFormat(bytes(0x4d, 0x4d, 0x00, 0x2a), 'x.bin'), 'tiff');
	assert.equal(detectFormat(bytes(0, 0, 1, 0, 1, 0), 'x.bin'), 'ico');
	assert.equal(detectFormat(ftyp('avif'), 'x.bin'), 'avif');
	assert.equal(detectFormat(ftyp('heic'), 'x.bin'), 'heic');
	assert.equal(detectFormat(ftyp('mif1'), 'x.heif'), 'heic');
	// AVIF files may declare a generic major brand and list avif among the compatible brands.
	const mif1Avif = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmif1\0\0\0\0mif1avif', 'latin1')]);
	assert.equal(detectFormat(mif1Avif, 'x.avif'), 'avif');
});

test('detectFormat accepts SVG text only when it is really an SVG', () => {
	assert.equal(detectFormat(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'), 'logo.svg'), 'svg');
	assert.equal(detectFormat(Buffer.from('<html></html>'), 'page.svg'), undefined);
	assert.equal(detectFormat(Buffer.from('<svg/>'), 'logo.txt'), undefined);
});

test('detectFormat rejects unknown content', () => {
	assert.equal(detectFormat(Buffer.from('hello world'), 'a.png'), undefined);
	assert.equal(detectFormat(new Uint8Array(0), 'a.png'), undefined);
});

test('isImagePath checks the extension, ignoring case and prototype names', () => {
	for (const file of ['a.JPG', 'b.jpeg', 'c.HEIC', 'd.webp', 'e.bmp', 'f.TIF', 'g.svg', 'h.ico', 'i.avif', 'j.gif', 'k.png']) {
		assert.equal(isImagePath(file), true, file);
	}
	for (const file of ['a.txt', 'b', 'toString', 'constructor', '.png.bak', 'c.pdf']) {
		assert.equal(isImagePath(file), false, file);
	}
});
