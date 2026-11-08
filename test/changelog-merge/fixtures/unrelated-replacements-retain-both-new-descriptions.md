# Unrelated replacements retain both new descriptions

## Base

````markdown
# Changelog

## [Unreleased]

- Pears

## [1.0.0] - 2024-01-01

- Initial release

[unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Ours

````diff
 # Changelog

 ## [Unreleased]

-- Pears
+- Apples

 ## [1.0.0] - 2024-01-01

 - Initial release

 [unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Theirs

````diff
 # Changelog

 ## [Unreleased]

-- Pears
+- Oranges

 ## [1.0.0] - 2024-01-01

 - Initial release

 [unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Expected

````markdown
# Changelog

## [Unreleased]

- Apples

- Oranges

## [1.0.0] - 2024-01-01

- Initial release

[unreleased]: https://example.com/compare/v1.0.0...HEAD
````
