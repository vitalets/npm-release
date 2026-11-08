# Repeated original bullets require review when matching is ambiguous

## Base

````markdown
# Changelog

## [Unreleased]

- Apples
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
 - Apples
+- Pears

 ## [1.0.0] - 2024-01-01

 - Initial release

 [unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Theirs

No changes.

## Expected status

````text
conflict
````

## Expected reason

````regex
Multiple possible
````
