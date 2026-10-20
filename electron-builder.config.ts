import type { Configuration } from 'electron-builder';
import { appIdentity } from './src/main/appIdentity';

const qa = process.env.VORA_CHANNEL === 'qa';
const { appId, productName, executableName, icon } = appIdentity(qa ? 'qa' : 'prod');

const config: Configuration = {
    appId,
    productName,
    extraMetadata: { name: executableName, productName },
    copyright: 'Copyright © The Vora authors',
    directories: { output: 'dist', buildResources: 'resources' },
    files: ['out/**/*', 'resources/icons/**/*', 'package.json'],
    extraResources: [
        { from: 'src/player', to: 'player', filter: ['vora/**/*', 'fonts/**/*', 'input.conf'] },
        { from: 'THIRD-PARTY-NOTICES.md', to: 'THIRD-PARTY-NOTICES.md' },
    ],
    asar: true,
    electronFuses: {
        runAsNode: false,
        enableNodeOptionsEnvironmentVariable: false,
        enableNodeCliInspectArguments: false,
        enableEmbeddedAsarIntegrityValidation: true,
        onlyLoadAppFromAsar: true,
    },
    publish: [{ provider: 'github', owner: 'axufuris', repo: 'Vora.Desktop', releaseType: qa ? 'prerelease' : 'release', channel: qa ? 'qa' : 'latest' }],
    win: {
        target: [{ target: 'nsis', arch: ['x64'] }],
        icon,
        artifactName: qa ? 'Vora-QA-Setup-${version}.${ext}' : 'Vora-Setup-${version}.${ext}',
        extraResources: [{ from: 'resources/mpv', to: 'mpv' }],
    },
    nsis: {
        oneClick: true,
        perMachine: false,
        deleteAppDataOnUninstall: false,
        shortcutName: productName,
        uninstallDisplayName: productName,
    },
    linux: {
        target: [
            { target: 'AppImage', arch: ['x64'] },
            { target: 'deb', arch: ['x64'] },
            { target: 'rpm', arch: ['x64'] },
        ],
        executableName,
        icon,
        category: 'AudioVideo',
        synopsis: 'The Windows and Linux app for a Vora media server',
        maintainer: 'Vora <support@getvora.net>',
        vendor: 'Vora',
        desktop: { entry: { Name: productName, StartupWMClass: executableName } },
    },
    appImage: { artifactName: qa ? 'Vora-QA-${version}.${ext}' : 'Vora-${version}.${ext}' },
    deb: {
        packageName: executableName,
        artifactName: `${executableName}_\${version}_\${arch}.\${ext}`,
        depends: ['mpv', 'libgtk-3-0', 'libnotify4', 'libnss3', 'libxss1', 'libxtst6', 'xdg-utils', 'libatspi2.0-0', 'libuuid1', 'libsecret-1-0'],
    },
    rpm: {
        packageName: executableName,
        artifactName: `${executableName}-\${version}.\${arch}.\${ext}`,
        depends: ['mpv', 'gtk3', 'libnotify', 'nss', 'libXScrnSaver', '(libXtst or libXtst6)', 'xdg-utils', 'at-spi2-core', '(libuuid or libuuid1)'],
    },
};

export default config;
