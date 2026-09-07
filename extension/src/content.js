(() => {
  'use strict';

  const PREVIEW_CLASS = 'npm-release-preview';
  const RELEASE_OPERATIONS = ['patch', 'minor', 'major'];
  const RELEASE_RANK = { patch: 0, minor: 1, major: 2 };

  function firstToken(value) {
    return value.trim().split(/\s+/, 1)[0];
  }

  function hasExpectedVersionOperations(values) {
    const operations = values.filter((value) => value.trim()).map(firstToken);
    return (
      operations.length === RELEASE_OPERATIONS.length &&
      RELEASE_OPERATIONS.every((operation) => operations.includes(operation))
    );
  }

  function parseVersion(version) {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      version,
    );
    if (!match) throw new Error(`Invalid current version: ${version}`);

    const numbers = match.slice(1, 4).map(Number);
    if (!numbers.every(Number.isSafeInteger)) throw new Error(`Invalid current version: ${version}`);

    const prerelease = match[4] ? match[4].split('.') : [];
    if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
      throw new Error(`Invalid current version: ${version}`);
    }

    return { major: numbers[0], minor: numbers[1], patch: numbers[2], prerelease };
  }

  function parseChannel(channel) {
    const parts = channel.split('.');
    if (
      !channel ||
      parts.some(
        (part) =>
          !/^[0-9A-Za-z-]+$/.test(part) ||
          (/^\d+$/.test(part) && part.length > 1 && part.startsWith('0')),
      )
    ) {
      throw new Error(`Invalid prerelease channel: ${channel}`);
    }
    return parts;
  }

  function currentPrereleaseLine(version) {
    if (version.prerelease.length === 0) return undefined;
    if (version.patch > 0) return 'patch';
    if (version.minor > 0) return 'minor';
    return 'major';
  }

  function assertNotLowerRelease(currentVersion, currentLine, channel, release) {
    if (currentLine === undefined || RELEASE_RANK[release] >= RELEASE_RANK[currentLine]) return;
    const requestedOperation = channel === 'stable' ? release : `${channel}-${release}`;
    throw new Error(
      `Cannot use ${requestedOperation} from ${currentVersion}: ` +
        `lower operations are not permitted while on a ${currentLine} prerelease line`,
    );
  }

  function incrementStable(version, release) {
    const hasPrerelease = version.prerelease.length > 0;
    const next = { ...version, prerelease: [] };

    if (release === 'patch') {
      if (!hasPrerelease) next.patch += 1;
    } else if (release === 'minor') {
      if (!(hasPrerelease && next.patch === 0)) next.minor += 1;
      next.patch = 0;
    } else {
      if (!(hasPrerelease && next.minor === 0 && next.patch === 0)) next.major += 1;
      next.minor = 0;
      next.patch = 0;
    }

    return next;
  }

  function incrementPrerelease(version, channelParts) {
    const current = version.prerelease;
    const sameChannel = channelParts.every((part, index) => current[index] === part);
    if (!sameChannel) return { ...version, prerelease: [...channelParts, '0'] };

    const prerelease = [...current];
    for (let index = prerelease.length - 1; index >= channelParts.length; index -= 1) {
      if (/^\d+$/.test(prerelease[index])) {
        prerelease[index] = String(Number(prerelease[index]) + 1);
        return { ...version, prerelease };
      }
    }
    prerelease.push('0');
    return { ...version, prerelease };
  }

  function formatVersion(version) {
    const base = `${version.major}.${version.minor}.${version.patch}`;
    return version.prerelease.length ? `${base}-${version.prerelease.join('.')}` : base;
  }

  function calculateNextVersion(currentVersion, channel, versionChoice) {
    if (!channel) throw new Error('Select a release channel');

    const release = firstToken(versionChoice);
    if (!RELEASE_OPERATIONS.includes(release)) {
      throw new Error(`Unknown version operation: ${release || versionChoice}`);
    }

    const parsed = parseVersion(currentVersion);
    const currentLine = currentPrereleaseLine(parsed);
    assertNotLowerRelease(currentVersion, currentLine, channel, release);

    if (channel === 'stable') return formatVersion(incrementStable(parsed, release));

    const channelParts = parseChannel(channel);
    if (currentLine === release) {
      return formatVersion(incrementPrerelease(parsed, channelParts));
    }

    const next = incrementStable(parsed, release);
    next.prerelease = [...channelParts, '0'];
    return formatVersion(next);
  }

  function createPackageVersionLoader(fetchImplementation) {
    let requestId = 0;
    let controller;

    return async function loadPackageVersion(url) {
      controller?.abort();
      controller = new AbortController();
      const currentRequestId = ++requestId;

      try {
        const response = await fetchImplementation(url, {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const packageJson = await response.json();
        if (typeof packageJson.version !== 'string') {
          throw new Error('package.json has no string version field');
        }
        parseVersion(packageJson.version);

        return currentRequestId === requestId
          ? { status: 'success', version: packageJson.version }
          : { status: 'stale' };
      } catch (error) {
        if (currentRequestId !== requestId || error?.name === 'AbortError') {
          return { status: 'stale' };
        }
        return { status: 'error', message: error instanceof Error ? error.message : String(error) };
      }
    };
  }

  function selectedRef(form) {
    const summary = form.querySelector('.branch-selection summary');
    const name = summary?.querySelector('[data-menu-button]')?.textContent?.trim();
    if (!name) return undefined;
    return { name, type: summary.textContent?.includes('Tag:') ? 'tags' : 'heads' };
  }

  function repositoryFromLocation() {
    const match = /^\/([^/]+)\/([^/]+)\/actions\/workflows\//.exec(location.pathname);
    return match ? { owner: match[1], repository: match[2] } : undefined;
  }

  function rawPackageUrl(repository, ref) {
    const encodePath = (value) => value.split('/').map(encodeURIComponent).join('/');
    return `/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}/raw/refs/${ref.type}/${encodePath(ref.name)}/package.json`;
  }

  function createRow(label) {
    const row = document.createElement('div');
    row.className = `${PREVIEW_CLASS}__row`;

    const labelElement = document.createElement('span');
    labelElement.className = `${PREVIEW_CLASS}__label`;
    labelElement.textContent = `${label}:`;

    const value = document.createElement('span');
    value.className = `${PREVIEW_CLASS}__value`;
    row.append(labelElement, value);
    return { row, value };
  }

  function enhanceForm(form, loader) {
    if (form.dataset.npmReleasePreview === 'true') return;

    const channel = form.querySelector('select[name="inputs[channel]"]');
    const version = form.querySelector('select[name="inputs[version]"]');
    if (!(channel instanceof HTMLSelectElement) || !(version instanceof HTMLSelectElement)) return;
    if (!hasExpectedVersionOperations([...version.options].map((option) => option.value))) return;

    const ref = selectedRef(form);
    const repository = repositoryFromLocation();
    const versionGroup = version.closest('.form-group');
    if (!ref || !repository || !versionGroup) return;

    form.dataset.npmReleasePreview = 'true';
    const panel = document.createElement('div');
    panel.className = PREVIEW_CLASS;
    panel.setAttribute('aria-live', 'polite');
    const currentRow = createRow('Current version');
    const nextRow = createRow('New version');
    panel.append(currentRow.row, nextRow.row);
    versionGroup.after(panel);

    let currentVersion;
    const render = () => {
      nextRow.value.classList.remove(`${PREVIEW_CLASS}__value--error`);
      if (!currentVersion) {
        nextRow.value.textContent = '—';
        return;
      }
      try {
        nextRow.value.textContent = calculateNextVersion(currentVersion, channel.value, version.value);
      } catch (error) {
        nextRow.value.textContent = error instanceof Error ? error.message : String(error);
        nextRow.value.classList.add(`${PREVIEW_CLASS}__value--error`);
      }
    };

    currentRow.value.textContent = 'Loading…';
    render();
    channel.addEventListener('change', render);
    version.addEventListener('change', render);

    void loader(rawPackageUrl(repository, ref)).then((result) => {
      if (result.status === 'stale' || !panel.isConnected) return;
      if (result.status === 'error') {
        currentRow.value.textContent = `Unavailable (${result.message})`;
        currentRow.value.classList.add(`${PREVIEW_CLASS}__value--error`);
        return;
      }
      currentVersion = result.version;
      currentRow.value.textContent = currentVersion;
      render();
    });
  }

  function start() {
    const loader = createPackageVersionLoader(fetch);
    let scanQueued = false;
    const scan = () => {
      scanQueued = false;
      document
        .querySelectorAll('.workflow-dispatch form')
        .forEach((form) => enhanceForm(form, loader));
    };
    const queueScan = () => {
      if (scanQueued) return;
      scanQueued = true;
      queueMicrotask(scan);
    };

    new MutationObserver(queueScan).observe(document.documentElement, { childList: true, subtree: true });
    scan();
  }

  // Kept on the isolated content-script global so the zero-build script can be unit tested.
  globalThis.__npmReleasePreview = {
    calculateNextVersion,
    createPackageVersionLoader,
    hasExpectedVersionOperations,
  };

  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') start();
})();
