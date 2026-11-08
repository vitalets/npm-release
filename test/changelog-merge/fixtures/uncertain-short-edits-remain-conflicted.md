# Uncertain short edits remain conflicted

## Base

````markdown
# Changelog

## [Unreleased]

- Enable authentication

## [1.0.0] - 2024-01-01

- Initial release

[unreleased]: https://example.com/compare/v1.0.0...HEAD
````

## Ours

````diff
 # Changelog

 ## [Unreleased]

-- Enable authentication
+- Disable authentication

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
matching
````
