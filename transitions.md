# Version transitions

Select a Channel explicitly; the action rejects the `-` placeholder. Version defaults to `patch` in the workflow UI.

- Channel `stable` follows npm's stable SemVer behavior and publishes with the default `latest` tag.
- Any other channel is used as both the SemVer prerelease identifier and npm dist-tag. Consumers can add options such as `alpha`, `beta`, `rc`, or `canary` to their workflow.
- A prerelease starts the requested version line at `<channel>.0`. Selecting the same channel and line increments `<channel>.N`.
- Switching channels on the same line resets the suffix to the requested `<channel>.0`.
- While on a `minor` or `major` prerelease, lower operations are rejected because they would branch below the unreleased line.

## stable → stable

- `1.2.3` + (stable, patch) → `1.2.4`
- `1.2.3` + (stable, minor) → `1.3.0`
- `1.2.3` + (stable, major) → `2.0.0`

## stable → beta

- `1.2.3` + (beta, patch) → `1.2.4-beta.0`
- `1.2.3` + (beta, minor) → `1.3.0-beta.0`
- `1.2.3` + (beta, major) → `2.0.0-beta.0`

## beta → stable

### beta patch → stable

- `1.2.3-beta.0` + (stable, patch) → `1.2.3`
- `1.2.3-beta.0` + (stable, minor) → `1.3.0`
- `1.2.3-beta.0` + (stable, major) → `2.0.0`

### beta minor → stable

- `1.2.0-beta.0` + (stable, patch) → **Not permitted**
- `1.2.0-beta.0` + (stable, minor) → `1.2.0`
- `1.2.0-beta.0` + (stable, major) → `2.0.0`

### beta major → stable

- `1.0.0-beta.0` + (stable, patch) → **Not permitted**
- `1.0.0-beta.0` + (stable, minor) → **Not permitted**
- `1.0.0-beta.0` + (stable, major) → `1.0.0`

## beta → beta

### beta patch → beta

- `1.2.3-beta.0` + (beta, patch) → `1.2.3-beta.1`
- `1.2.3-beta.0` + (beta, minor) → `1.3.0-beta.0`
- `1.2.3-beta.0` + (beta, major) → `2.0.0-beta.0`

### beta minor → beta

- `1.2.0-beta.0` + (beta, patch) → **Not permitted**
- `1.2.0-beta.0` + (beta, minor) → `1.2.0-beta.1`
- `1.2.0-beta.0` + (beta, major) → `2.0.0-beta.0`

### beta major → beta

- `1.0.0-beta.0` + (beta, patch) → **Not permitted**
- `1.0.0-beta.0` + (beta, minor) → **Not permitted**
- `1.0.0-beta.0` + (beta, major) → `1.0.0-beta.1`

## alpha → beta

### alpha patch → beta

- `1.2.3-alpha.4` + (beta, patch) → `1.2.3-beta.0`
- `1.2.3-alpha.4` + (beta, minor) → `1.3.0-beta.0`
- `1.2.3-alpha.4` + (beta, major) → `2.0.0-beta.0`

### alpha minor → beta

- `1.2.0-alpha.4` + (beta, patch) → **Not permitted**
- `1.2.0-alpha.4` + (beta, minor) → `1.2.0-beta.0`
- `1.2.0-alpha.4` + (beta, major) → `2.0.0-beta.0`

### alpha major → beta

- `1.0.0-alpha.4` + (beta, patch) → **Not permitted**
- `1.0.0-alpha.4` + (beta, minor) → **Not permitted**
- `1.0.0-alpha.4` + (beta, major) → `1.0.0-beta.0`
