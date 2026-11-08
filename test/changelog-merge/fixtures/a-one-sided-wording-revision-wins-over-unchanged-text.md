# A one-sided wording revision wins over unchanged text

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

-- Provide detailed diagnostics for failed uploads
+- Provide detailed diagnostics for failed upload

 ## [1.0.0] - 2024-01-01

 - Initial release

 [unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Theirs

No changes.

## Expected

````markdown
# Changelog

## [Unreleased]

- Provide detailed diagnostics for failed upload

## [1.0.0] - 2024-01-01

- Initial release

[unreleased]: https://example.com/compare/v1.0.0...HEAD
````
