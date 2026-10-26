(() => {
  'use strict';

  const PREVIEW_CLASS = 'npm-release-preview';
  const LOG_PREFIX = '[npm-release helper]';
  const RELEASE_OPERATIONS = ['patch', 'minor', 'major'];
  const RELEASE_RANK = { patch: 0, minor: 1, major: 2 };
  const formDiagnostics = new WeakMap();
  const formPreviews = new WeakMap();
  let loggingEnabled = false;

  async function initializeLogging() {
    if (!globalThis.chrome?.storage) return;
    let settingChanged = false;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes.loggingEnabled) return;
      settingChanged = true;
      loggingEnabled = changes.loggingEnabled.newValue === true;
    });
    try {
      const settings = await chrome.storage.local.get({ loggingEnabled: false });
      if (!settingChanged) loggingEnabled = settings.loggingEnabled === true;
    } catch {
      // Keep previews working with logging disabled if storage is unavailable.
    }
  }

  const loggingReady = initializeLogging();

  function log(level, message, details) {
    if (!loggingEnabled) return;
    const logger = globalThis.console?.[level] ?? globalThis.console?.log;
    if (!logger) return;
    if (details === undefined) {
      logger.call(globalThis.console, `${LOG_PREFIX} ${message}`);
    } else {
      logger.call(globalThis.console, `${LOG_PREFIX} ${message}`, details);
    }
  }

  function logFormDiagnostic(form, status, details) {
    if (!loggingEnabled) return;
    if (formDiagnostics.get(form) === status) return;
    formDiagnostics.set(form, status);
    const level = status === 'enhanced' ? 'info' : status.startsWith('skipped:') ? 'warn' : 'debug';
    log(level, `Form ${status}`, { form, ...details });
  }

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
    const available = RELEASE_OPERATIONS.filter((operation) => RELEASE_RANK[operation] >= RELEASE_RANK[currentLine]);
    const verb = channel === 'stable' ? 'release' : 'pre-release';
    throw new Error(`Can't ${verb} ${release} on ${currentVersion}: already on a ${currentLine} pre-release. Select version: ${available.join(' or ')}.`);
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
      log('debug', 'Loading package version', { requestId: currentRequestId, url });

      try {
        const response = await fetchImplementation(url, {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        log('debug', 'Package response received', {
          requestId: currentRequestId,
          status: response.status,
          url,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const packageJson = await response.json();
        if (typeof packageJson.version !== 'string') {
          throw new Error('package.json has no string version field');
        }
        parseVersion(packageJson.version);

        if (currentRequestId !== requestId) {
          log('debug', 'Ignoring stale package response', { requestId: currentRequestId, url });
          return { status: 'stale' };
        }

        log('info', 'Package version loaded', {
          requestId: currentRequestId,
          url,
          version: packageJson.version,
        });
        return { status: 'success', version: packageJson.version };
      } catch (error) {
        if (currentRequestId !== requestId || error?.name === 'AbortError') {
          log('debug', 'Package request aborted or superseded', {
            requestId: currentRequestId,
            url,
          });
          return { status: 'stale' };
        }
        const message = error instanceof Error ? error.message : String(error);
        log('error', 'Could not load package version', { requestId: currentRequestId, url, message });
        return { status: 'error', message };
      }
    };
  }

  function selectedRef(root) {
    const picker = root?.querySelector('button[data-icv-name="Switch branches/tags"]');
    if (picker) {
      const name = picker.querySelector('[data-component="text"]')?.textContent?.trim();
      if (!name) return undefined;
      if (picker.querySelector('.octicon-tag')) return { name, type: 'tags' };
      if (picker.querySelector('.octicon-git-branch')) return { name, type: 'heads' };
      return undefined;
    }
    const summary = root?.querySelector('.branch-selection summary');
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

  function releaseLinks(repository, ref, version) {
    const base = `/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}`;
    const name = ref.name.split('/').map(encodeURIComponent).join('/');
    const fullRef = `refs/${ref.type}/${name}`;
    return {
      changelog: `${base}/blob/${fullRef}/CHANGELOG.md#unreleased`,
      head: `${base}/tree/${fullRef}`,
      tag: `${base}/tree/refs/tags/${encodeURIComponent(`v${version}`)}`,
      compare: `${base}/compare/${encodeURIComponent(`v${version}`)}...${fullRef}`,
    };
  }

  function commitFromPage(html) {
    function readOid(data) {
      const payload = data?.payload ?? data;
      const routes = [payload?.codeViewTreeRoute, payload?.codeViewRepoRoute, payload];
      for (const route of routes) {
        const oid = route?.refInfo?.currentOid;
        if (typeof oid === 'string' && /^[a-f0-9]{40}$/i.test(oid)) return oid.toLowerCase();
      }
    }
    // GitHub may return route JSON instead of a complete HTML document.
    try {
      const oid = readOid(JSON.parse(html));
      if (oid) return oid;
    } catch { /* Read embedded route data below. */ }
    for (const match of html.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const oid = readOid(JSON.parse(match[1]));
        if (oid) return oid;
      } catch { /* Ignore unrelated or malformed script data. */ }
    }
    throw new Error('GitHub commit metadata unavailable');
  }

  async function checkReleaseCommit(fetchImplementation, links, signal) {
    try {
      const commits = await Promise.all([links.head, links.tag].map(async (url) => {
        const response = await fetchImplementation(url, {
          credentials: 'same-origin', cache: 'no-store', signal,
          headers: { Accept: 'text/html' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        try {
          return commitFromPage(await response.text());
        } catch (error) {
          log('warn', 'Commit metadata unavailable', { url, contentType: response.headers.get('content-type') });
          throw error;
        }
      }));
      return { status: commits[0] === commits[1] ? 'same' : 'different' };
    } catch (error) {
      // Some signed-in GitHub page variants omit the ref metadata. The comparison
      // page explicitly identifies equal refs, without confusing an empty file diff
      // (which can still contain commits) with identical commits.
      if (links.compare && !signal?.aborted) {
        try {
          const response = await fetchImplementation(links.compare, {
            credentials: 'same-origin', cache: 'no-store', signal,
            headers: { Accept: 'text/html' },
          });
          if (response.ok && identicalComparison(await response.text())) return { status: 'same' };
        } catch { /* Leave failed or ambiguous checks hidden. */ }
      }
      return { status: 'unknown', message: error instanceof Error ? error.message : String(error) };
    }
  }

  function identicalComparison(html) {
    return /<h3\b[^>]*>\s*There (?:isn’t|isn't|isn&#39;t) anything to compare\.\s*<\/h3>/.test(html) &&
      /<\/strong>\s+are identical\./.test(html);
  }

  function setVersionMessage(element, message, version) {
    element.textContent = '';
    const parts = version ? message.split(version) : [message];
    let selectingOptions = false;
    parts.forEach((part, index) => {
      if (index > 0) {
        const strong = document.createElement('strong');
        strong.textContent = version;
        element.append(strong);
      }
      for (const token of part.split(/(Select version:|\b(?:patch|minor|major)\b)/)) {
        if (token === 'Select version:') selectingOptions = true;
        if (selectingOptions && RELEASE_OPERATIONS.includes(token)) {
          const strong = document.createElement('strong');
          strong.textContent = token;
          element.append(strong);
        } else {
          element.append(token);
        }
      }
    });
  }

  function createLink(text) {
    const link = document.createElement('a');
    link.textContent = text;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${text} (opens in a new tab)`);
    link.append(' ↗');
    return link;
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

  function enhanceForm(form) {
    const existing = formPreviews.get(form);
    const channel = form.querySelector('select[name="inputs[channel]"]');
    const version = form.querySelector('select[name="inputs[version]"]');
    if (!(channel instanceof HTMLSelectElement) || !(version instanceof HTMLSelectElement)) {
      existing?.dispose();
      logFormDiagnostic(form, 'skipped: release inputs not found together', {
        channelFound: channel instanceof HTMLSelectElement,
        versionFound: version instanceof HTMLSelectElement,
      });
      return;
    }

    const versionOperations = [...version.options].map((option) => option.value);
    if (!hasExpectedVersionOperations(versionOperations)) {
      existing?.dispose();
      logFormDiagnostic(form, 'skipped: unexpected version operations', { versionOperations });
      return;
    }

    const dispatch = form.closest('[data-testid="workflow-dispatch-dialog-content"], .workflow-dispatch');
    const ref = selectedRef(dispatch);
    const repository = repositoryFromLocation();
    const versionGroup = version.closest('[data-component="FormControl"], .form-group');
    if (!ref || !repository || !versionGroup) {
      existing?.dispose();
      logFormDiagnostic(form, 'skipped: required context not found', {
        dispatchFound: Boolean(dispatch),
        ref,
        repository,
        versionGroupFound: Boolean(versionGroup),
        branchSelectorElsewhere: Boolean(
          document.querySelector('.workflow-dispatch .branch-selection'),
        ),
      });
      return;
    }

    if (existing && existing.channel === channel && existing.version === version && existing.panel.isConnected) {
      existing.update(repository, ref);
      return;
    }
    existing?.dispose();
    const loader = createPackageVersionLoader(fetch);
    const packageUrl = rawPackageUrl(repository, ref);
    logFormDiagnostic(form, 'enhanced', {
      repository,
      ref,
      channel: channel.value,
      versionOperation: version.value,
      packageUrl,
    });
    const panel = document.createElement('div');
    panel.className = PREVIEW_CLASS;
    panel.setAttribute('aria-live', 'polite');
    const currentRow = createRow('Cur version');
    const nextRow = createRow('New version');
    const messageRow = document.createElement('div');
    messageRow.className = `${PREVIEW_CLASS}__message`;
    const commitMessage = document.createElement('div');
    commitMessage.className = `${PREVIEW_CLASS}__message`;
    const commitsRow = { row: commitMessage, value: commitMessage };
    const linksRow = document.createElement('div');
    linksRow.className = `${PREVIEW_CLASS}__links`;
    const changelogLink = createLink('Changelog');
    const compareLink = createLink('Diff');
    linksRow.append(changelogLink, compareLink);
    panel.append(currentRow.row, nextRow.row, messageRow, commitsRow.row, linksRow);
    versionGroup.after(panel);

    let currentVersion;
    let packageError;
    let commitStatus;
    const render = () => {
      nextRow.value.textContent = '-';
      nextRow.value.classList.toggle(`${PREVIEW_CLASS}__value--prompt`, !channel.value);
      linksRow.hidden = true;
      commitsRow.row.hidden = true;
      messageRow.hidden = false;
      messageRow.textContent = '';
      messageRow.classList.remove(`${PREVIEW_CLASS}__value--error`);
      if (!channel.value) {
        nextRow.value.textContent = 'Select channel';
        messageRow.hidden = true;
        return;
      }
      if (!currentVersion) {
        messageRow.textContent = packageError || 'Loading…';
        messageRow.classList.toggle(`${PREVIEW_CLASS}__value--error`, Boolean(packageError));
        return;
      }
      try {
        const nextVersion = calculateNextVersion(currentVersion, channel.value, version.value);
        nextRow.value.textContent = nextVersion;
        messageRow.hidden = true;
        linksRow.hidden = false;
        commitsRow.row.hidden = !['same', 'different'].includes(commitStatus);
        log('debug', 'Version preview calculated', {
          currentVersion,
          channel: channel.value,
          versionOperation: version.value,
          nextVersion,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setVersionMessage(messageRow, message, currentVersion);
        messageRow.classList.add(`${PREVIEW_CLASS}__value--error`);
        log('warn', 'Could not calculate version preview', {
          currentVersion,
          channel: channel.value,
          versionOperation: version.value,
          message,
        });
      }
    };

    channel.addEventListener('change', render);
    version.addEventListener('change', render);

    let loadedUrl;
    let checkController;
    let generation = 0;
    const update = (repository, ref) => {
      const url = rawPackageUrl(repository, ref);
      if (loadedUrl === url) return;
      loadedUrl = url;
      const currentGeneration = ++generation;
      checkController?.abort();
      checkController = new AbortController();
      const signal = checkController.signal;
      changelogLink.href = releaseLinks(repository, ref).changelog;
      compareLink.hidden = true;
      commitsRow.row.hidden = true;
      commitsRow.value.textContent = '';
      commitsRow.value.classList.remove(`${PREVIEW_CLASS}__value--error`);
      currentVersion = undefined;
      packageError = undefined;
      commitStatus = undefined;
      currentRow.value.textContent = 'Loading…';
      currentRow.value.classList.remove(`${PREVIEW_CLASS}__value--error`);
      render();
      void loader(url).then((result) => {
        if (result.status === 'stale' || !panel.isConnected || currentGeneration !== generation) return;
        if (result.status === 'error') {
          commitsRow.row.hidden = true;
          currentRow.value.textContent = '-';
          packageError = `Unavailable (${result.message})`;
          render();
          return;
        }
        currentVersion = result.version;
        currentRow.value.textContent = currentVersion;
        render();
        const links = releaseLinks(repository, ref, currentVersion);
        compareLink.href = links.compare;
        compareLink.hidden = false;
        void checkReleaseCommit(fetch, links, signal).then((check) => {
          if (signal.aborted || !panel.isConnected || currentGeneration !== generation) return;
          commitStatus = check.status;
          if (check.status === 'same') {
            setVersionMessage(commitsRow.value, `No new commits since release v${result.version}.`, `v${result.version}`);
            commitsRow.value.classList.add(`${PREVIEW_CLASS}__value--error`);
          } else if (check.status === 'different') {
            commitsRow.value.textContent = 'Changes detected';
          } else {
            commitsRow.value.textContent = '';
            log('debug', 'Release commit check unavailable', { message: check.message });
          }
          render();

        });
      });
    };
    formPreviews.set(form, {
      channel, version, panel, update,
      dispose() {
        checkController?.abort();
        formPreviews.delete(form);
        channel.removeEventListener('change', render);
        version.removeEventListener('change', render);
        panel.remove();
      },
    });
    update(repository, ref);
  }

  function start() {
    log('info', 'Content script started', {
      url: location.href,
      readyState: document.readyState,
    });
    let scanQueued = false;
    let previousFormCount;
    const scan = () => {
      scanQueued = false;
      // GitHub navigation can replace page content without loading a new document.
      // Stay installed across the site, but only inspect forms on workflow pages.
      if (!repositoryFromLocation()) return;
      const forms = [...document.querySelectorAll('.workflow-dispatch form, [data-testid="workflow-dispatch-dialog-content"] form')];
      if (forms.length !== previousFormCount) {
        log(forms.length ? 'debug' : 'warn', 'Scanning workflow dispatch forms', {
          formCount: forms.length,
          workflowDispatchFound: Boolean(document.querySelector('.workflow-dispatch')),
        });
        previousFormCount = forms.length;
      }
      forms.forEach((form) => enhanceForm(form));
    };
    const queueScan = () => {
      if (scanQueued) return;
      scanQueued = true;
      queueMicrotask(scan);
    };

    new MutationObserver(queueScan).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-busy'],
    });
    scan();
  }

  // Kept on the isolated content-script global so the zero-build script can be unit tested.
  globalThis.__npmReleasePreview = {
    calculateNextVersion,
    releaseLinks,
    commitFromPage,
    identicalComparison,
    checkReleaseCommit,
    createPackageVersionLoader,
    hasExpectedVersionOperations,
    selectedRef,
  };

  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    void loggingReady.then(start);
  }
})();
