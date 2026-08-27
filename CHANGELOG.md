# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [2.1.0] - 2026-08-27

### Changed

- Replace separate stable and beta release inputs with required Channel and Version inputs
- Publish prereleases under the npm dist-tag matching their channel and support custom prerelease channels

## [2.0.0] - 2026-08-25

### Changed

- Use separate stable and beta release dropdowns with npm-compatible version transitions
- Let `beta-patch`, `beta-minor`, and `beta-major` start or continue their matching beta line
- Run dependency-free TypeScript sources directly without a build step
- Add a self-release workflow that always skips npm publishing

### Fixed

- Increment the beta suffix when the selected beta operation matches the current beta line
- Reject lower release operations while on a minor or major beta line

## [1.0.0] - 2026-06-02

### Added

- Initial release of npm-release composite action
- OIDC trusted publishing support
- Pre-release support with `--tag next`
- Dry-run mode

[unreleased]: https://github.com/vitalets/npm-release/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/vitalets/npm-release/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/vitalets/npm-release/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/vitalets/npm-release/releases/tag/v1.0.0
