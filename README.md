# VSCode Image Converter

[![Release](https://img.shields.io/github/v/release/thomas-serment/VSCode-Image-Converter)](https://github.com/thomas-serment/VSCode-Image-Converter/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Convert images to JPG, PNG or WebP from the Explorer, in one click.

## Features

- Right-click one or many images, or a whole folder (subfolders included), and pick the output format
- Reads HEIC (iPhone photos), AVIF, BMP, TIFF, GIF, ICO and SVG on top of JPG, PNG and WebP
- Writes JPG, PNG or WebP, with an adjustable quality
- Photos are turned upright using their EXIF orientation, and transparency becomes white in JPG
- Never overwrites a file: existing names get a ` (1)`, ` (2)`... suffix
- Remembers the last output format you picked
- Runs locally in the background with a progress bar you can cancel, and works on every platform with a single file

## Installation

1. Download the latest `.vsix` from the [Releases](https://github.com/thomas-serment/VSCode-Image-Converter/releases/latest) page
2. In VS Code, run **Extensions: Install from VSIX...** and select the file

## Usage

Right-click images or a folder in the Explorer and choose **Convert Images...**, or run **Image Converter: Convert Images...** from the Command Palette to browse for files. Converted files are saved in a `converted` folder next to each source image.

| Setting | Default | Description |
| --- | --- | --- |
| `imageConverter.quality` | `90` | Quality of JPG and WebP outputs, from 1 to 100 (PNG is lossless) |
| `imageConverter.outputFolder` | `converted` | Name of the folder that receives the converted files |

## Good to know

- Metadata (EXIF, color profile) is not kept in the converted files
- Animated GIFs and multi-page TIFFs convert their first image only, and ICO files use their largest size
- SVG files are rendered at 1024 px or more on their longest side, and text needs fonts the converter does not have, so convert SVGs without text for best results
- HEIC and AVIF are read only: they are not offered as output formats
- Images above 150 megapixels or 256 MB are refused

## Requirements

VS Code 1.120 or later. Virtual workspaces are not supported. Nothing is downloaded or uploaded: every codec ships inside the extension.

## Third-party software

Decoding and encoding rely on open source WebAssembly codecs: [jSquash](https://github.com/jamsinclair/jSquash) (Apache-2.0), [resvg](https://github.com/RazrFalcon/resvg-js) (MPL-2.0) and [libheif-js](https://github.com/catdad-experiments/libheif-js) (LGPL-3.0, shipped unmodified in `vendor/`), plus utif2, omggif, bmp-js and decode-ico (MIT). Their licenses are in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt), which also ships inside the VSIX.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
