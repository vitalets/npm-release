# Fenced blocks permit text merging without a release

## Base

````markdown
# Changelog

## [Unreleased]

## [1.0.0] - 2024-01-01

- Initial release

[unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Ours

````diff
 # Changelog

 ## [Unreleased]
+
+- Foo
+  ```js
+  foo()
+  ```

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
