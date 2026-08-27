# Version transitions

Select a Channel explicitly; the action rejects the `-` placeholder. Version defaults to `patch` in the workflow UI.

- Channel `stable` follows npm's stable SemVer behavior and publishes with the default `latest` tag.
- Any other channel is used as both the SemVer prerelease identifier and npm dist-tag. The examples use the conventional npm `next` tag; consumers can add other options such as `alpha`, `rc`, or `canary` to their workflow.
- A prerelease starts the requested version line at `<channel>.0`. Selecting the same channel and line increments `<channel>.N`.
- Switching channels on the same line resets the suffix to the requested `<channel>.0`.
- While on a `minor` or `major` prerelease, lower operations are rejected because they would branch below the unreleased line.

## stable → stable

- `1.2.3` + (stable, patch) → `1.2.4`
- `1.2.3` + (stable, minor) → `1.3.0`
- `1.2.3` + (stable, major) → `2.0.0`

## stable → next

- `1.2.3` + (next, patch) → `1.2.4-next.0`
- `1.2.3` + (next, minor) → `1.3.0-next.0`
- `1.2.3` + (next, major) → `2.0.0-next.0`

## next → stable

### next patch → stable

- `1.2.3-next.0` + (stable, patch) → `1.2.3`
- `1.2.3-next.0` + (stable, minor) → `1.3.0`
- `1.2.3-next.0` + (stable, major) → `2.0.0`

### next minor → stable

- `1.2.0-next.0` + (stable, patch) → **Not permitted**
- `1.2.0-next.0` + (stable, minor) → `1.2.0`
- `1.2.0-next.0` + (stable, major) → `2.0.0`

### next major → stable

- `1.0.0-next.0` + (stable, patch) → **Not permitted**
- `1.0.0-next.0` + (stable, minor) → **Not permitted**
- `1.0.0-next.0` + (stable, major) → `1.0.0`

## next → next

### next patch → next

- `1.2.3-next.0` + (next, patch) → `1.2.3-next.1`
- `1.2.3-next.0` + (next, minor) → `1.3.0-next.0`
- `1.2.3-next.0` + (next, major) → `2.0.0-next.0`

### next minor → next

- `1.2.0-next.0` + (next, patch) → **Not permitted**
- `1.2.0-next.0` + (next, minor) → `1.2.0-next.1`
- `1.2.0-next.0` + (next, major) → `2.0.0-next.0`

### next major → next

- `1.0.0-next.0` + (next, patch) → **Not permitted**
- `1.0.0-next.0` + (next, minor) → **Not permitted**
- `1.0.0-next.0` + (next, major) → `1.0.0-next.1`

## alpha → next

### alpha patch → next

- `1.2.3-alpha.4` + (next, patch) → `1.2.3-next.0`
- `1.2.3-alpha.4` + (next, minor) → `1.3.0-next.0`
- `1.2.3-alpha.4` + (next, major) → `2.0.0-next.0`

### alpha minor → next

- `1.2.0-alpha.4` + (next, patch) → **Not permitted**
- `1.2.0-alpha.4` + (next, minor) → `1.2.0-next.0`
- `1.2.0-alpha.4` + (next, major) → `2.0.0-next.0`

### alpha major → next

- `1.0.0-alpha.4` + (next, patch) → **Not permitted**
- `1.0.0-alpha.4` + (next, minor) → **Not permitted**
- `1.0.0-alpha.4` + (next, major) → `1.0.0-next.0`
