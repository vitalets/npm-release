# Changelog

> This project follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [Unreleased]

- Support GitHub’s new workflow dispatch side panel and refresh version previews on ref changes

## [2.3.1] - 2026-09-23

- Pin workflows and examples to `ubuntu-24.04` to avoid runner version migration warnings
- Rename the extension's Old version label to Cur versioin and explicitly left-align version values
- Update `actions/checkout` and `actions/setup-node` examples and workflows to v7
- Reject release channel inputs that do not start with a letter

## [2.3.0] - 2026-09-07

- Use an empty option as the unselected release channel in workflow inputs
- Add an optional Chrome extension that previews release version changes in GitHub's workflow form
- Add diagnostic console logs for the extension's form detection and version preview flow
- Support GitHub's separate branch-selection and workflow-input forms in the version preview extension
- Align the extension's Old version and New version preview rows

## [2.2.0] - 2026-09-04

- Derive changelog links from the GitHub Actions repository environment instead of `package.json`

## [2.1.1] - 2026-08-27

- Use `next` as the prerelease channel in workflow examples, documentation, and tests
- Document that prereleases published to the `next` dist-tag are installable as `package-name@next`

## [2.1.0] - 2026-08-27

- Replace separate stable and beta release inputs with required Channel and Version inputs
- Publish prereleases under the npm dist-tag matching their channel and support custom prerelease channels

## [2.0.0] - 2026-08-25

- Use separate stable and beta release dropdowns with npm-compatible version transitions
- Let `beta-patch`, `beta-minor`, and `beta-major` start or continue their matching beta line
- Run dependency-free TypeScript sources directly without a build step
- Add a self-release workflow that always skips npm publishing
- Increment the beta suffix when the selected beta operation matches the current beta line
- Reject lower release operations while on a minor or major beta line

## [1.0.0] - 2026-06-02

- Initial release of npm-release composite action
- OIDC trusted publishing support
- Pre-release support with `--tag next`
- Dry-run mode

[unreleased]: https://github.com/vitalets/npm-release/compare/v2.3.1...HEAD
[2.3.1]: https://github.com/vitalets/npm-release/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/vitalets/npm-release/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/vitalets/npm-release/compare/v2.1.1...v2.2.0
[2.1.1]: https://github.com/vitalets/npm-release/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/vitalets/npm-release/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/vitalets/npm-release/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/vitalets/npm-release/releases/tag/v1.0.0
