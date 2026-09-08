# npm release version preview

A minimal Chrome extension that adds current and next package versions to GitHub's **Run workflow** form.

<img src="https://raw.githubusercontent.com/vitalets/npm-release/main/extension/screenshot.png" alt="Chrome extension showing the current and next package versions in GitHub's Run workflow form" width="368">

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/src` directory.

## Use

Open a GitHub Actions workflow and click **Run workflow**. The preview appears when the form contains:

- a `channel` choice input;
- a `version` choice input with `patch`, `minor`, and `major` options.

The extension reads the version from the root `package.json` on the selected branch or tag. It updates the preview when you change the channel, version operation, or ref. The preview is informational and never blocks GitHub's **Run workflow** button.

No GitHub token or extension configuration is required. Access to private repositories uses the existing signed-in GitHub session.

## Debugging

Open the workflow page's DevTools console and filter for `[npm-release helper]`. The extension logs
when its content script starts, which workflow forms it finds, why a form is skipped, package version
requests, and version preview calculations. After editing the unpacked extension, reload it on
`chrome://extensions` and then reload the workflow page.
