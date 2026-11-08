# Outside edits without a release permit text merging

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
-# Changelog
+# History

 ## [Unreleased]

 - Apples

 ## [1.0.0] - 2024-01-01

 - Initial release

 [unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Theirs

No changes.

## Expected status

````text
not-applicable
````
