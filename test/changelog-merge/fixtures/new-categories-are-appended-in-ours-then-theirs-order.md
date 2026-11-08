# New categories are appended in ours then theirs order

## Base

````markdown
# Changelog

## [Unreleased]

### Added
- Pears

## [1.0.0] - 2024-01-01

- Initial release

[unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Ours

````diff
 # Changelog

 ## [Unreleased]

 ### Added
 - Pears

+### Fixed
+- Apples
+
 ## [1.0.0] - 2024-01-01

 - Initial release

 [unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Theirs

````diff
 # Changelog

 ## [Unreleased]

 ### Added
 - Pears

+### Changed
+- Oranges
+
 ## [1.0.0] - 2024-01-01

 - Initial release

 [unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Expected

````markdown
# Changelog

## [Unreleased]

### Added
- Pears

### Fixed
- Apples

### Changed
- Oranges

## [1.0.0] - 2024-01-01

- Initial release

[unreleased]: https://example.com/compare/v1.0.0...HEAD
````
