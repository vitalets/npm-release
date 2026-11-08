# A remote release preserves published entries and relocates multiline additions

## Base

````markdown
# Changelog

## [Unreleased]

- Apples

## [1.0.0] - 2024-01-01

- Initial release

[unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Ours

````diff
 # Changelog

 ## [Unreleased]

 - Apples
+- Oranges
+  With more details.
+  - Nested item

 ## [1.0.0] - 2024-01-01

 - Initial release

 [unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Theirs

````diff
 # Changelog

 ## [Unreleased]
+
+## [1.1.0] - 2024-02-01

 - Apples

 ## [1.0.0] - 2024-01-01

 - Initial release

-[unreleased]: https://example.com/compare/v1.0.0...HEAD
+[unreleased]: https://example.com/compare/v1.1.0...HEAD
+[1.1.0]: https://example.com/compare/v1.0.0...v1.1.0
````

## Expected

````markdown
# Changelog

## [Unreleased]

- Oranges
  With more details.
  - Nested item

## [1.1.0] - 2024-02-01

- Apples

## [1.0.0] - 2024-01-01

- Initial release

[unreleased]: https://example.com/compare/v1.1.0...HEAD
[1.1.0]: https://example.com/compare/v1.0.0...v1.1.0
````
