# Release detection rejects rewritten ancestor entries

## Base

````markdown
# Changelog

## [Unreleased]

- Provide detailed diagnostics for failed uploads

## [1.0.0] - 2024-01-01

- Initial release

[unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Ours

````diff
 # Changelog

 ## [Unreleased]

 - Provide detailed diagnostics for failed uploads
+- Apples

 ## [1.0.0] - 2024-01-01

 - Initial release

 [unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Theirs

````diff
 # Changelog

 ## [Unreleased]

-- Provide detailed diagnostics for failed uploads
+## [1.1.0] - 2024-02-01
+
+- Provide detailed diagnostics for failed upload

 ## [1.0.0] - 2024-01-01

 - Initial release

-[unreleased]: https://example.com/compare/v1.0.0...HEAD
+[unreleased]: https://example.com/compare/v1.1.0...HEAD
+[1.1.0]: https://example.com/compare/v1.0.0...v1.1.0
````

## Expected status

````text
conflict
````

## Expected reason

````regex
locate unchanged
````
