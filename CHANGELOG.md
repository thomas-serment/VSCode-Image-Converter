# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.0.1] - 2026-10-06

### Changed

- Updated the development toolchain to its latest versions (TypeScript 7, esbuild 0.28, and the VS Code typings)
- Requires VS Code 1.140 or later, and the Node typings and the release build now target Node 24, the version VS Code 1.140 runs
- Updated the GitHub Actions of the release workflow

### Removed

- ESLint and the lint step of the release workflow, TypeScript strict mode and the tests are the checks

## [2.0.0] - 2026-10-06

### Added

- Read HEIC, AVIF, BMP, TIFF, GIF, ICO and SVG files, on top of JPG, PNG and WebP
- Folders are converted recursively, skipping the output, hidden and `node_modules` folders
- Progress notification with a cancel button and a single summary at the end, with details in the Image Converter output channel
- `imageConverter.quality` and `imageConverter.outputFolder` settings
- The last output format is remembered and offered first
- Third-party licenses are listed in `THIRD-PARTY-NOTICES.txt`
- Photos are turned upright using their EXIF orientation, and transparency becomes white in JPG
- Automated tests, including every input format through the bundled worker

### Changed

- Rewritten in TypeScript on WebAssembly codecs instead of sharp: one VSIX works on Linux, Windows and macOS, with no native build
- Output formats are now JPG, PNG and WebP only
- Conversions run in background workers, so the editor stays responsive
- Messages and the command are now in English, and the command id is `image-converter.convert`

### Removed

- TIFF, AVIF and HEIF output formats
- The sharp and `fs` dependencies

### Fixed

- Existing files are never overwritten: a numeric suffix is added instead
- One notification per image is replaced by a single summary
- Large folders no longer start every conversion at once
- Dependency vulnerabilities reported by `npm audit`

## [1.1.1] - 2025-05-06

### Added

- TIFF, AVIF and HEIF output formats

### Changed

- Converted images are saved in a `converted` folder next to the source image instead of beside it
- Shorter confirmation messages

## [1.0.17] - 2024-08-04

### Fixed

- Release workflow fixes (versions 1.0.1 to 1.0.17), with no change to the extension itself

## [1.0.0] - 2024-08-03

### Added

- GitHub release workflow that builds and publishes the VSIX from a version commit

## [0.0.1] - 2024-02-19

### Added

- First version: right-click images or folders in the Explorer to convert them to JPEG, PNG or WebP with sharp
