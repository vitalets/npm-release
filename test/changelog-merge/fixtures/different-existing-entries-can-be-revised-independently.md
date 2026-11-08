# Different existing entries can be revised independently

## Base

````markdown
# Changelog

## [Unreleased]

- Provide detailed diagnostics for failed uploads
- Display detailed information for pending downloads

## [1.0.0] - 2024-01-01

- Initial release

[unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Ours

````diff
 # Changelog

 ## [Unreleased]

-- Provide detailed diagnostics for failed uploads
+- Provide detailed diagnostics for failed upload
 - Display detailed information for pending downloads

 ## [1.0.0] - 2024-01-01

 - Initial release

 [unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Theirs

````diff
 # Changelog

 ## [Unreleased]

 - Provide detailed diagnostics for failed uploads
-- Display detailed information for pending downloads
+- Display detailed information for pending download

 ## [1.0.0] - 2024-01-01

 - Initial release

 [unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Expected

````markdown
# Changelog

## [Unreleased]

- Provide detailed diagnostics for failed upload
- Display detailed information for pending download

## [1.0.0] - 2024-01-01

- Initial release

[unreleased]: https://example.com/compare/v1.0.0...HEAD
````
