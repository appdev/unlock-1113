import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';

// Exercise the real settings registration without mounting unrelated panels.
const upstream = process.argv[2];
assert.ok(upstream, 'Usage: node scripts/check-account-ui.mjs <patched-upstream>');
const load = path => stripTypeScriptTypes(readFileSync(resolve(upstream, path), 'utf8'))
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const source = load('app/src/config/tabs/syncTab.ts');
const groups = [];
let providerOptions;
const group = new Proxy({}, {get: (_target, key) => (id, config) => {
    if (key === 'select' && id === 'sync.provider') providerOptions = config.options;
}});
const context = {
    window: {siyuan: {languages: {managedStorageTitle: 'QingYu'}, config: {system: {container: 'docker'}}}},
    getSyncProviderConfigKeywords: () => [],
    getSyncProviderConfigRowKeywords: () => [],
    getSyncProviderSelection: sync => sync.managedStorage ? 5 : sync.provider,
    resumeManagedStorageSync: async () => {},
    mountSyncProvider() {},
    QINGYU_PROVIDER: 5,
    mountSyncAssetDownloadMode() {},
    mountLANSyncStatus() {},
    getLANSyncSearchAvailability() {},
    registerAccountGroup() { groups.push('account'); },
    tab: {group(id) { groups.push(id); return group; }},
};
runInNewContext(`${source}\nregisterSyncTab(tab);`, context);
assert.deepEqual(groups, ['sync', 'repo'], 'Sync settings must contain no account/login group');
assert.equal(providerOptions[0].value, 5, 'QingYu must be the first independent provider option');
assert.equal(providerOptions[0].label, 'QingYu');
assert.deepEqual(Array.from(providerOptions, option => option.value), [5, 2, 3, 4], 'Official SiYuan must not appear in the provider selector');
console.log('PASS: sync settings register only sync and local repository groups');

const panel = {innerHTML: '', querySelector: () => null, querySelectorAll: () => [], addEventListener() {}};
const configRow = {...panel, classList: {toggle() {}}};
const syncContext = {
    mountManagedStorage() {},
    window: {siyuan: {user: {userSiYuanOneTimePayStatus: 1}, languages: {_kernel: {214: 'LOGIN_REQUIRED'}},
        config: {sync: {provider: 2, s3: {}, webdav: {}}}}},
    getCloudURL: () => '',
    getHostCapabilities: () => ({importExport: false}),
    escapeHtmlTextAndAttr: value => String(value ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`),
    root: {querySelector: selector => selector === '#syncProviderConfigRow' ? configRow : panel},
};
const renderSource = load('app/src/util/needSubscribe.ts') + '\n' + load('app/src/config/tabs/syncUi.ts');
for (const provider of [2, 3]) {
    syncContext.window.siyuan.config.sync.provider = provider;
    runInNewContext(`${renderSource}\nrenderProviderConfig(root);`, {...syncContext});
    assert.match(configRow.innerHTML, /data-action="configureSync"/, 'Third-party sync configuration must be editable');
    assert.doesNotMatch(panel.innerHTML, /LOGIN_REQUIRED/);
}
syncContext.window.siyuan.user = null;
runInNewContext(`${renderSource}\nrenderProviderConfig(root);`, {...syncContext});
assert.match(panel.innerHTML, /LOGIN_REQUIRED/, 'Control case must detect the reported missing-user regression');
assert.equal(configRow.innerHTML, '', 'Missing-user control must hide the provider configuration row');
console.log('PASS: S3/WebDAV configuration renders for local unlock state; missing-user control is blocked');

const syncSource = load('app/src/dialog/processSystem.ts');
const processStart = syncSource.indexOf('const processSync =');
const processEnd = syncSource.indexOf('\nconst ', processStart + 1);
const syncRenderer = syncSource.slice(processStart, processEnd === -1 ? undefined : processEnd)
    .replace(/\/\/\/ #if MOBILE[\s\S]*?\/\/\/ #else/, '').replace('/// #endif', '');
const toolbar = () => {
    const classes = new Set();
    const attributes = new Map();
    return {
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name),
        },
        getAttribute: name => attributes.get(name) ?? null,
        setAttribute: (name, value) => attributes.set(name, value),
    };
};
const button = toolbar();
const icon = toolbar();
button.firstElementChild = toolbar();
button.querySelector = selector => selector === 'use' ? icon : null;
button.setAttribute('aria-label', '数据同步尚未启用');
icon.setAttribute('xlink:href', '#iconCloudOff');
const sync = {provider: 2, managedStorage: true, enabled: false};
const fields = {username: {value: 'test-user'}, password: {value: 'test-password'}, remember: {checked: false}};
let submitLogin;
const form = {querySelector: selector => fields[selector.slice(7, -2)],
    addEventListener: (event, listener) => { if (event === 'submit') submitLogin = listener; }};
const storagePanel = {isConnected: true, querySelector: () => form, querySelectorAll: () => []};
const toggle = {checked: false};
const settings = {querySelector: selector => selector === '[data-managed-storage]' ? storagePanel :
    selector === '[id="sync.enabled"]' ? toggle : null};
const signedOut = {configured: true, managed: true, loggedIn: false, syncEnabled: false, state: 'signed_out'};
const enabled = {...signedOut, loggedIn: true, syncEnabled: true, state: 'ready'};
const messages = {disabled: '数据同步尚未启用', ready: '立即同步', syncing: '正在同步', done: '同步完成'};
const actions = runInNewContext(`${syncRenderer}\n${load('app/src/config/tabs/managedStorage.ts')}\n({mountManagedStorage, processSync})`, {
    AbortController, CustomEvent, MutationObserver: class { observe() {} },
    window: {siyuan: {config: {sync}, languages: {
        _kernel: {53: messages.disabled, 81: messages.syncing}, syncNow: messages.ready,
    }}, dispatchEvent() {}},
    document: {body: {}, querySelector: selector => selector === '#barSync' ? button : null},
    escapeHtmlTextAndAttr: text => String(text ?? ''),
    emitToPlugins() {},
    fetchSyncPost: async path => ({code: 0, data: path.endsWith('loginManagedStorage') ? enabled : signedOut}),
});
actions.mountManagedStorage(settings, () => {});
const settle = () => new Promise(resolve => setImmediate(resolve));
await settle();
submitLogin({preventDefault() {}, currentTarget: form});
await settle();
assert.equal(toggle.checked, true);
assert.equal(button.getAttribute('aria-label'), messages.ready, 'Successful first sign-in must clear the disabled tooltip immediately');
assert.equal(icon.getAttribute('xlink:href'), '#iconCloudSucc');
actions.processSync({code: 0, msg: messages.syncing});
assert.equal(button.getAttribute('aria-label'), messages.syncing);
assert.ok(button.firstElementChild.classList.contains('fn__rotate'));
actions.processSync();
assert.equal(icon.getAttribute('xlink:href'), '#iconRefresh', 'Refreshing settings must preserve an in-progress sync');
actions.processSync({code: 1, msg: messages.done});
assert.equal(button.getAttribute('aria-label'), messages.done);
assert.equal(icon.getAttribute('xlink:href'), '#iconCloudSucc');
assert.equal(button.firstElementChild.classList.contains('fn__rotate'), false);
sync.enabled = false;
actions.processSync();
assert.equal(button.getAttribute('aria-label'), messages.disabled);
assert.equal(icon.getAttribute('xlink:href'), '#iconCloudOff');
console.log('PASS: first sign-in updates the sync toolbar before upload, and sync messages keep it current');
