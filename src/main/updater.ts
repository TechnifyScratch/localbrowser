import { app, BrowserWindow, net, shell } from 'electron';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { autoUpdater } from 'electron-updater';
import type { UpdateState } from '../shared/types';

interface AvailableUpdate {
  version: string;
  files: Array<{ url: string; sha512: string }>;
}

const runFile = promisify(execFile);
const RELEASE_DOWNLOAD_ROOT = 'https://github.com/TechnifyScratch/localbrowser/releases/latest/download';

export class LocalUpdater {
  private state: UpdateState = { status: 'unavailable', currentVersion: app.getVersion(), message: 'Update checks are available in installed builds.' };
  private ready = false;
  private availableUpdate?: AvailableUpdate;
  private downloadedInstaller?: string;

  get snapshot(): UpdateState { return { ...this.state }; }

  async initialize(automaticChecks: boolean): Promise<void> {
    if (!app.isPackaged) return;
    if (!(await this.hasReleaseSource())) {
      this.setState({ status: 'unavailable', message: 'Connect a GitHub Releases repository to enable updates.' });
      return;
    }

    const delivery = await this.hasDeveloperIdSignature() ? 'in-place' : 'dmg';
    this.ready = true;
    this.setState({ status: 'idle', delivery, message: delivery === 'dmg' ? 'Unsigned builds download a verified DMG from GitHub Releases.' : 'Updates are delivered through GitHub Releases.' });
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => this.setState({ status: 'checking', message: 'Checking GitHub Releases…' }));
    autoUpdater.on('update-available', (info) => {
      this.availableUpdate = { version: info.version, files: info.files.map(({ url, sha512 }) => ({ url, sha512 })) };
      this.setState({ status: 'available', availableVersion: info.version, message: this.state.delivery === 'dmg' ? `Local ${info.version} can be downloaded as a DMG.` : `Local ${info.version} is ready to download.` });
    });
    autoUpdater.on('update-not-available', () => this.setState({ status: 'not-available', message: 'Local is up to date.' }));
    autoUpdater.on('download-progress', (progress) => this.setState({ status: 'downloading', progress: Math.max(0, Math.min(100, progress.percent)), message: `Downloading Local ${this.state.availableVersion ?? ''}…` }));
    autoUpdater.on('update-downloaded', (info) => this.setState({ status: 'downloaded', availableVersion: info.version, progress: 100, message: `Local ${info.version} is ready to install.` }));
    autoUpdater.on('error', () => {
      if (this.state.status !== 'downloading') this.setState({ status: 'error', message: 'Local couldn’t reach or verify the update. Try again shortly.' });
    });

    if (automaticChecks) setTimeout(() => { void this.check(); }, 5_000);
  }

  async check(): Promise<UpdateState> {
    if (!this.ready) return this.snapshot;
    if (this.state.status === 'checking' || this.state.status === 'downloading') return this.snapshot;
    try { await autoUpdater.checkForUpdates(); }
    catch { this.setState({ status: 'error', message: 'Local couldn’t reach GitHub Releases. Check your connection and try again.' }); }
    return this.snapshot;
  }

  async download(): Promise<UpdateState> {
    if (!this.ready || this.state.status !== 'available') return this.snapshot;
    this.setState({ status: 'downloading', progress: 0, message: `Downloading Local ${this.state.availableVersion ?? ''}…` });
    try {
      if (this.state.delivery === 'dmg') await this.downloadDmg();
      else await autoUpdater.downloadUpdate();
    } catch {
      this.setState({ status: 'error', message: 'The update couldn’t be downloaded or verified. No installer was opened.' });
    }
    return this.snapshot;
  }

  async install(): Promise<void> {
    if (this.state.status !== 'downloaded') return;
    if (this.state.delivery === 'dmg' && this.downloadedInstaller) {
      const error = await shell.openPath(this.downloadedInstaller);
      if (error) this.setState({ status: 'error', message: 'The DMG was downloaded, but macOS couldn’t open it.' });
      return;
    }
    autoUpdater.quitAndInstall(false, true);
  }

  automaticChecksDidChange(enabled: boolean): void {
    if (enabled && this.ready) void this.check();
  }

  private async downloadDmg(): Promise<void> {
    const update = this.availableUpdate;
    if (!update) throw new Error('Missing update metadata');
    const dmg = update.files.find(({ url }) => url.toLowerCase().endsWith(`${process.arch}.dmg`))
      ?? update.files.find(({ url }) => url.toLowerCase().endsWith('.dmg'));
    if (!dmg?.sha512) throw new Error('The release does not contain a verifiable DMG');

    const filename = path.posix.basename(new URL(dmg.url, 'https://local.invalid').pathname);
    if (!filename.toLowerCase().endsWith('.dmg')) throw new Error('Invalid installer filename');
    const destination = await this.availableDownloadPath(filename);
    const partial = `${destination}.part`;
    const response = await net.fetch(`${RELEASE_DOWNLOAD_ROOT}/${encodeURIComponent(filename)}`, { redirect: 'follow' });
    if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`);

    const expectedSize = Number(response.headers.get('content-length')) || 0;
    let received = 0;
    const hash = createHash('sha512');
    const progress = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        received += chunk.length;
        hash.update(chunk);
        if (expectedSize) this.setState({ status: 'downloading', progress: (received / expectedSize) * 100, message: `Downloading Local ${update.version}…` });
        callback(null, chunk);
      },
    });

    try {
      await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), progress, createWriteStream(partial, { flags: 'wx' }));
      if (hash.digest('base64') !== dmg.sha512) throw new Error('Installer checksum mismatch');
      await fs.rename(partial, destination);
    } catch (error) {
      await fs.rm(partial, { force: true });
      throw error;
    }

    this.downloadedInstaller = destination;
    this.setState({ status: 'downloaded', availableVersion: update.version, progress: 100, message: 'Verified DMG saved to Downloads. Open it to replace Local.' });
  }

  private async availableDownloadPath(filename: string): Promise<string> {
    const parsed = path.parse(filename);
    for (let index = 0; index < 1_000; index += 1) {
      const suffix = index ? ` (${index})` : '';
      const candidate = path.join(app.getPath('downloads'), `${parsed.name}${suffix}${parsed.ext}`);
      try { await fs.access(candidate); }
      catch { return candidate; }
    }
    throw new Error('Could not choose a download path');
  }

  private setState(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch, currentVersion: app.getVersion() };
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('update:state', this.snapshot);
  }

  private async hasDeveloperIdSignature(): Promise<boolean> {
    if (process.platform !== 'darwin') return false;
    const bundle = path.dirname(path.dirname(path.dirname(process.execPath)));
    try {
      const { stderr } = await runFile('/usr/bin/codesign', ['-dv', '--verbose=4', bundle]);
      return /Authority=Developer ID Application:/i.test(stderr);
    } catch { return false; }
  }

  private async hasReleaseSource(): Promise<boolean> {
    try {
      const config = await fs.readFile(path.join(process.resourcesPath, 'app-update.yml'), 'utf8');
      return /provider:\s*github/i.test(config) && !/YOUR_GITHUB_USERNAME|YOUR_REPOSITORY/i.test(config);
    } catch { return false; }
  }
}
