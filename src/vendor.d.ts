declare module 'omggif' {
	export class GifReader {
		constructor(buffer: Uint8Array);
		readonly width: number;
		readonly height: number;
		decodeAndBlitFrameRGBA(frameIndex: number, pixels: Uint8ClampedArray): void;
	}
}

declare module 'bmp-js' {
	export function decode(buffer: Uint8Array): {
		data: Uint8Array;
		width: number;
		height: number;
		bitPP: number;
	};
}

// The extension host is Node, which has WebAssembly at runtime but no DOM typings here.
declare namespace WebAssembly {
	interface Module {}
}
declare const WebAssembly: {
	compile(bytes: Uint8Array): Promise<WebAssembly.Module>;
};
