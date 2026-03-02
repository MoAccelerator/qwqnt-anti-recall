import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { BrowserWindow, app, dialog, ipcMain } from 'electron';

type DbStorageType = 'json' | 'ldb';
type EffectiveStorage = 'json' | 'level';

interface AntiRecallConfig {
  mainColor: string;
  saveDb: boolean;
  dbStorageType: DbStorageType;
  saveImagesToDataDir: boolean;
  enableShadow: boolean;
  enableTip: boolean;
  isAntiRecallSelfMsg: boolean;
  enablePeriodicCleanup: boolean;
  maxMsgSaveLimit: number;
  deleteMsgCountPerTime: number;
}

interface StorageStatus {
  effective: EffectiveStorage;
  requested: DbStorageType;
  error?: string;
}

interface RKeyData {
  group_rkey: string;
  private_rkey: string;
  expired_time: number;
}

class RKeyManager {
  private serverUrl: string;
  private rkeyData: RKeyData = { group_rkey: '', private_rkey: '', expired_time: 0 };

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  async getRkey(): Promise<RKeyData> {
    if (this.isExpired()) {
      try {
        await this.refreshRkey();
      } catch (e) {
        console.log('获取 rkey 失败', e);
      }
    }
    return this.rkeyData;
  }

  private isExpired(): boolean {
    return Date.now() / 1000 > this.rkeyData.expired_time;
  }

  private async refreshRkey(): Promise<void> {
    this.rkeyData = await this.fetchServerRkey();
  }

  private async fetchServerRkey(): Promise<RKeyData> {
    const res = await fetch(this.serverUrl);
    if (!res.ok) throw new Error(res.statusText);
    return (await res.json()) as RKeyData;
  }
}

const LEGACY_IMAGE_ORIGIN = 'https://gchat.qpic.cn';
const NT_IMAGE_ORIGIN = 'https://multimedia.nt.qq.com.cn';

class ImageDownloader {
  private rkeyManager = new RKeyManager('https://llob.linyuchen.net/rkey');
  private saveToDataDir: string | null = null;

  constructor(opts?: { saveToDataDir?: string }) {
    if (opts?.saveToDataDir) this.saveToDataDir = path.join(opts.saveToDataDir, 'images');
  }

  setSaveToDataDir(dataDir: string | null): void {
    this.saveToDataDir = dataDir ? path.join(dataDir, 'images') : null;
  }

  async getImageUrl(picElement: any): Promise<string> {
    if (!picElement) return '';
    const originImageUrl: string | undefined = picElement.originImageUrl;
    const md5HexStr: string | undefined = picElement.md5HexStr;

    if (originImageUrl) {
      const url = new URL(LEGACY_IMAGE_ORIGIN + originImageUrl);
      const appid = url.searchParams.get('appid');

      if (appid && ['1406', '1407'].includes(appid)) {
        let rkey = url.searchParams.get('rkey');
        if (rkey) return NT_IMAGE_ORIGIN + originImageUrl;

        const rkeys = await this.rkeyManager.getRkey();
        rkey = appid === '1406' ? rkeys.private_rkey : rkeys.group_rkey;
        return NT_IMAGE_ORIGIN + originImageUrl + rkey;
      }

      return LEGACY_IMAGE_ORIGIN + originImageUrl;
    }

    if (md5HexStr) return `${LEGACY_IMAGE_ORIGIN}/gchatpic_new/0/0-0-${md5HexStr.toUpperCase()}/0`;

    this.output('Pic url get error:', picElement);
    return '';
  }

  async downloadPic(msgRecord: any): Promise<void> {
    if (!Array.isArray(msgRecord?.elements)) return;

    const msgIdStr = String(msgRecord?.msgId ?? '');

    for (let idx = 0; idx < msgRecord.elements.length; idx++) {
      const el = msgRecord.elements[idx];
      if (!el?.picElement) continue;

      const pic = el.picElement;
      const sourcePath: string | undefined = pic.sourcePath;
      if (!sourcePath) continue;

      const thumbMap = new Map<number, string>([
        [0, sourcePath],
        [198, sourcePath],
        [720, sourcePath],
      ]);

      const url = await this.getImageUrl(pic);
      this.output('Download lost pic(s)... url=', url, 'msgId=', msgIdStr, 'to=', sourcePath);

      let tooSmall = false;
      try {
        tooSmall = fs.statSync(sourcePath).size <= 100;
      } catch {
        // ignore
      }

      if (!fs.existsSync(sourcePath) || tooSmall) {
        this.output('Download pic:', url, ' to ', sourcePath);
        const data = await this.request(url);
        try {
          JSON.parse(data.toString());
          this.output('Picture already expired.', url, sourcePath);
        } catch {
          fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
          fs.writeFileSync(sourcePath, data);
          await this.copyToDataDir(data, msgIdStr, sourcePath, idx);
        }
      } else {
        this.output('Pic already existed, skip.', sourcePath);
        if (this.saveToDataDir) {
          await this.copyToDataDir(fs.readFileSync(sourcePath), msgIdStr, sourcePath, idx);
        }
      }

      if (pic?.thumbPath && (Array.isArray(pic.thumbPath) || pic.thumbPath instanceof Object)) {
        pic.thumbPath = thumbMap;
      }
    }
  }

  private async copyToDataDir(data: Buffer, msgId: string, sourcePath: string, idx: number): Promise<void> {
    if (!this.saveToDataDir) return;
    try {
      fs.mkdirSync(this.saveToDataDir, { recursive: true });
      const ext = path.extname(sourcePath) || '.jpg';
      const base = path.basename(sourcePath, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
      const out = path.join(this.saveToDataDir, `${msgId}_${idx}_${base}${ext}`);
      if (!fs.existsSync(out)) {
        fs.writeFileSync(out, data);
        this.output('Saved recalled image to data dir:', out);
      }
    } catch (e) {
      this.output('Failed to copy image to data dir:', e);
    }
  }

  private async request(url: string): Promise<Buffer> {
    return await new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url);

      req.on('error', err => {
        this.output('Download error', err);
        reject(err);
      });

      req.on('response', res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode <= 399 && res.headers.location) {
          resolve(this.request(res.headers.location));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('error', err => {
          this.output('Download error', err);
          reject(err);
        });
        res.on('data', c => chunks.push(Buffer.from(c)));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
    });
  }

  private output(...args: unknown[]): void {
    console.log('\x1B[32m%s\x1B[0m', 'Anti-Recall:', ...args);
  }
}

console.log('%c[Anti-Recall]', 'background:#ffdc00;color:#000000D9;padding:2px 4px;border-radius:4px;', 'Main loaded');

const PLUGIN_ID = 'qwqnt-anti-recall';

function getConfigDir(): string {
  const configs = (globalThis as any)?.qwqnt?.framework?.paths?.configs as string | undefined;
  return configs ? path.join(configs, PLUGIN_ID) : path.join(app.getPath('userData'), 'qwqnt-storage', 'config', PLUGIN_ID);
}

function getDataDir(): string {
  const data = (globalThis as any)?.qwqnt?.framework?.paths?.data as string | undefined;
  return data ? path.join(data, PLUGIN_ID) : path.join(app.getPath('userData'), 'qwqnt-storage', 'data', PLUGIN_ID);
}

let configPath = '';
const configDir = getConfigDir();
const dataDir = getDataDir();
const imagesDir = path.join(dataDir, 'images');

const jsonDbPath = path.join(dataDir, 'qq-recalled-db.json');
const levelDbPath = path.join(dataDir, 'qq-recalled-db.ldb');

const imageDownloader = new ImageDownloader();

const DEFAULT_CONFIG: AntiRecallConfig = {
  mainColor: '#ff6d6d',
  saveDb: false,
  dbStorageType: 'ldb',
  saveImagesToDataDir: false,
  enableShadow: true,
  enableTip: true,
  isAntiRecallSelfMsg: false,
  enablePeriodicCleanup: true,
  maxMsgSaveLimit: 10_000,
  deleteMsgCountPerTime: 500,
};

let config: AntiRecallConfig = { ...DEFAULT_CONFIG };

let effectiveStorage: EffectiveStorage = 'json';
let levelDb: any = null;
let jsonDb: Record<string, unknown> | null = null;
let levelError: string | null = null;

function writeDefaultConfig(): void {
  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
}

function readConfig(): AntiRecallConfig {
  if (!fs.existsSync(configPath)) {
    writeDefaultConfig();
    return { ...DEFAULT_CONFIG };
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as AntiRecallConfig;
}

function updateImageSaveDir(): void {
  imageDownloader.setSaveToDataDir(config.saveImagesToDataDir ? dataDir : null);
}

async function tryOpenLevelDb(): Promise<boolean> {
  if (levelDb) return true;
  if (config.dbStorageType !== 'ldb') return false;

  levelError = null;
  try {
    const mod = (await import('level')) as any;
    const LevelCtor = mod.Level ?? mod.default;
    levelDb = new LevelCtor(levelDbPath, { valueEncoding: 'utf8' });
    effectiveStorage = 'level';
    log('Using LevelDB storage:', levelDbPath);
    return true;
  } catch (e: any) {
    levelError = e?.message ?? String(e);
    log('LevelDB unavailable:', levelError);
    return false;
  }
}

function closeLevelDb(): void {
  if (!levelDb) return;
  try {
    void levelDb.close?.();
  } catch {
    // ignore
  }
  levelDb = null;
  effectiveStorage = 'json';
}

async function ensureJsonDbLoaded(): Promise<void> {
  if (jsonDb !== null) return;
  try {
    jsonDb = JSON.parse(fs.readFileSync(jsonDbPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    jsonDb = {};
  }
}

function flushJsonDb(): void {
  if (effectiveStorage === 'level') return;
  if (!jsonDb) return;
  fs.mkdirSync(path.dirname(jsonDbPath), { recursive: true });
  fs.writeFileSync(jsonDbPath, JSON.stringify(jsonDb), 'utf-8');
}

async function ensureStorageReady(): Promise<void> {
  if (!config.saveDb) return;

  if (config.dbStorageType === 'ldb') {
    const ok = await tryOpenLevelDb();
    if (!ok) {
      effectiveStorage = 'json';
      await ensureJsonDbLoaded();
      log('LevelDB failed, using JSON storage');
    }
    return;
  }

  closeLevelDb();
  effectiveStorage = 'json';
  await ensureJsonDbLoaded();
}

async function saveToDb(record: any): Promise<void> {
  if (!config.saveDb) return;
  await ensureStorageReady();

  if (effectiveStorage === 'level' && levelDb) {
    try {
      await levelDb.get(record.id);
    } catch {
      await levelDb.put(record.id, JSON.stringify(record));
    }
    return;
  }

  if (!jsonDb) return;
  if (!(record.id in jsonDb)) {
    jsonDb[record.id] = record;
    flushJsonDb();
  }
}

async function readFromDb(id: string): Promise<any | null> {
  if (!config.saveDb) return null;
  await ensureStorageReady();

  if (effectiveStorage === 'level' && levelDb) {
    try {
      const v = await levelDb.get(id);
      return JSON.parse(v);
    } catch {
      return null;
    }
  }

  if (!jsonDb) return null;
  return (jsonDb as any)[id] ?? null;
}

const msgFlowCache: Array<{ id: string; sender?: string; msg: any }> = [];
const recalledCache: Array<{ id: string; sender?: string; msg: any }> = [];

const patchedWindows: BrowserWindow[] = [];

function broadcast(channel: string): void {
  for (const win of patchedWindows) {
    if (win.isDestroyed()) continue;
    win.webContents.send(channel);
  }
}

function patchWindow(win: BrowserWindow): void {
  if (!win?.webContents || win.isDestroyed()) return;
  const wc: any = win.webContents;
  if (wc.__antiRecallPatched) return;
  wc.__antiRecallPatched = true;
  patchedWindows.push(win);

  const originalSend: any = wc.__qqntim_original_object?.send ?? wc.send.bind(wc);

  const wrappedSend = async (channel: string, ...args: any[]): Promise<any> => {
    try {
      if (args.length >= 2) {
        // msgList update: used to build recalled list on scroll.
        const hasMsgListUpdate = args.some(
          x => x && Object.prototype.hasOwnProperty.call(x, 'msgList') && Array.isArray(x.msgList) && x.msgList.length > 0,
        );

        if (hasMsgListUpdate) {
          let peerUid = '';
          const recalledIndex: number[] = [];

          for (const i in args[1].msgList) {
            const msg = args[1].msgList[i];
            peerUid = msg.peerUid;
            if (
              msg.msgType === 5 &&
              msg.subMsgType === 4 &&
              msg.elements?.[0]?.grayTipElement?.revokeElement &&
              (config.isAntiRecallSelfMsg || !msg.elements[0].grayTipElement.revokeElement.isSelfOperate)
            ) {
              recalledIndex.push(Number(i));
            }
          }

          recalledIndex.sort((a, b) => b - a);

          for (const i of recalledIndex) {
            const recalled = args[1].msgList[i];
            const msgId = String(recalled.msgId);

            const fromFlow = msgFlowCache.find(x => x.id === msgId);
            const fromRecalled = recalledCache.find(x => x.id === msgId);
            const fromDb = await readFromDb(msgId);

            let record: any = null;
            let source = '';

            if (fromRecalled) {
              record = fromRecalled;
              source = 'old msg';
            } else if (fromFlow) {
              if (!fromRecalled) recalledCache.push(fromFlow);
              record = fromFlow;
              source = 'msgFlow';
            } else if (fromDb) {
              if (!fromRecalled) recalledCache.push(fromDb);
              record = fromDb;
              source = 'dbMsg';
            }

            if (record?.msg && typeof record.msg === 'object') {
              const recovered = { ...record.msg, isOnlineMsg: true };
              await imageDownloader.downloadPic(recovered);
              log('Detected recall, intercepted and recovered from ' + source);

              for (const k in recovered) {
                if (['msgSeq', 'cntSeq', 'clientSeq', 'sendStatus', 'emojiLikesList'].includes(k)) continue;

                const v = (recovered as any)[k];
                const old = recalled[k];

                let next = v;
                if (['msgAttrs', 'msgMeta', 'generalFlags'].includes(k) && v && typeof v === 'object' && old && typeof old === 'object') {
                  for (const kk in old) {
                    if (Object.prototype.hasOwnProperty.call(old, kk)) delete old[kk];
                  }
                  next = Object.assign(old, v);
                }

                recalled[k] = next;
              }
            }
          }

          wc.send(
            'LiteLoader.anti_recall.mainWindow.recallTipList',
            recalledCache.filter(x => x.sender === peerUid || x?.sender == null).map(x => x.id),
          );
        }

        // cmdName update: used to detect realtime recall and cache incoming messages.
        const hasCmd = args.some(x => x && Object.prototype.hasOwnProperty.call(x, 'cmdName') && x.cmdName != null);
        if (hasCmd) {
          const payloadWrapper = args[1];
          if (!payloadWrapper) return originalSend(channel, ...args);

          if (
            payloadWrapper.cmdName &&
            (payloadWrapper.cmdName.includes('onMsgInfoListUpdate') || payloadWrapper.cmdName.includes('onActiveMsgInfoUpdate')) &&
            payloadWrapper.payload?.msgList instanceof Array &&
            payloadWrapper.payload.msgList[0]?.msgType === 5 &&
            payloadWrapper.payload.msgList[0]?.subMsgType === 4
          ) {
            const recallMsg = payloadWrapper.payload.msgList[0];
            const revoke = recallMsg.elements?.[0]?.grayTipElement?.revokeElement;
            if (revoke && (config.isAntiRecallSelfMsg || !revoke.isSelfOperate)) {
              const recallId = String(recallMsg.msgId);
              wc.send('LiteLoader.anti_recall.mainWindow.recallTip', recallId);

              const cached = msgFlowCache.find(x => x.id === recallId);
              const already = recalledCache.find(x => x.id === recallId);
              if (cached && !already) {
                recalledCache.push(cached);
                if (config.saveDb) await saveToDb(cached);
              }

              await imageDownloader.downloadPic(cached?.msg);
              await imageDownloader.downloadPic(already?.msg);

              args[1].cmdName = 'none';
              args[1].payload.msgList.pop();
              log('Detected recall, intercepted');
            }
          } else if (
            (payloadWrapper.cmdName &&
              payloadWrapper.payload &&
              (payloadWrapper.cmdName.includes('onRecvMsg') || payloadWrapper.cmdName.includes('onRecvActiveMsg')) &&
              payloadWrapper.payload.msgList instanceof Array) ||
            (payloadWrapper.cmdName && payloadWrapper.cmdName.includes('onAddSendMsg') && payloadWrapper.payload?.msgRecord != null) ||
            (payloadWrapper.cmdName && payloadWrapper.cmdName.includes('onMsgInfoListUpdate') && payloadWrapper.payload?.msgList instanceof Array)
          ) {
            const list: any[] = payloadWrapper.payload.msgList instanceof Array ? payloadWrapper.payload.msgList : [payloadWrapper.payload.msgRecord];
            for (const msg of list) {
              const msgId = String(msg.msgId);
              let idx = msgFlowCache.findIndex(x => x.id === msgId);
              if (idx === -1) {
                msgFlowCache.push({ id: msgId, sender: msg.peerUid, msg });
                idx = msgFlowCache.length - 1;
              }
              msgFlowCache[idx] = { id: msgId, sender: msg.peerUid, msg };

              if (config.enablePeriodicCleanup) {
                if (config.maxMsgSaveLimit == null) config.maxMsgSaveLimit = 10_000;
                if (config.deleteMsgCountPerTime == null) config.deleteMsgCountPerTime = 500;
                if (msgFlowCache.length > config.maxMsgSaveLimit) msgFlowCache.splice(0, config.deleteMsgCountPerTime);
              }
            }
          }
        }
      }
    } catch (e) {
      log(
        'NTQQ Anti-Recall Error: ',
        e,
        'Please report this to https://github.com/xh321/LiteLoaderQQNT-Anti-Recall/issues, thank you',
      );
    }

    return originalSend(channel, ...args);
  };

  if (wc.__qqntim_original_object) wc.__qqntim_original_object.send = wrappedSend;
  else wc.send = wrappedSend;

  log('NTQQ Anti-Recall patched for window:', win.id);
}

function log(...args: unknown[]): void {
  console.log('\x1B[32m%s\x1B[0m', 'Anti-Recall:', ...args);
}

function registerIpcHandlers(): void {
  ipcMain.handle('LiteLoader.anti_recall.getNowConfig', async () => config);

  ipcMain.handle('LiteLoader.anti_recall.getStorageStatus', async (): Promise<StorageStatus> => {
    if (config.saveDb && config.dbStorageType === 'ldb') await ensureStorageReady();
    return {
      effective: effectiveStorage,
      requested: config.dbStorageType,
      error: levelError ?? undefined,
    };
  });

  ipcMain.handle('LiteLoader.anti_recall.saveConfig', async (_event, newConfig: AntiRecallConfig) => {
    const prevStorage = config.dbStorageType;
    config = newConfig;

    if (newConfig.dbStorageType !== 'ldb' && prevStorage === 'ldb') closeLevelDb();
    updateImageSaveDir();
    broadcast('LiteLoader.anti_recall.mainWindow.repatchCss');

    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
  });

  ipcMain.handle('LiteLoader.anti_recall.clearDb', async () => {
    const res = await dialog.showMessageBox({
      type: 'warning',
      title: '警告',
      message: '清空所有已储存的撤回消息后不可恢复，是否确认清空？',
      buttons: ['确定', '取消'],
      cancelId: 1,
    });

    if (res.response !== 0) return;

    jsonDb = {};
    try {
      if (levelDb) {
        await levelDb.clear();
        await levelDb.close();
        levelDb = null;
      }
      closeLevelDb();

      if (fs.existsSync(jsonDbPath)) fs.unlinkSync(jsonDbPath);
      if (fs.existsSync(levelDbPath)) fs.rmSync(levelDbPath, { recursive: true, force: true });
      if (fs.existsSync(imagesDir)) fs.rmSync(imagesDir, { recursive: true, force: true });
    } catch {
      // ignore
    }

    await dialog.showMessageBox({
      type: 'info',
      title: '提示',
      message: '清空完毕，之前保存的所有已撤回消息均被删除，重启 QQ 后就能看见效果。',
      buttons: ['确定'],
    });
  });
}

async function initStorageIfNeeded(): Promise<void> {
  if (!config.saveDb) return;
  await ensureStorageReady();
}

async function init(): Promise<void> {
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  configPath = path.join(configDir, 'config.json');
  config = readConfig();

  if (config.mainColor == null) config.mainColor = '#ff6d6d';
  if (config.dbStorageType == null) config.dbStorageType = 'json';
  if (config.saveImagesToDataDir == null) config.saveImagesToDataDir = false;
  if (config.enableShadow == null) config.enableShadow = true;
  if (config.enableTip == null) config.enableTip = true;
  if (config.enablePeriodicCleanup == null) config.enablePeriodicCleanup = true;
  if (config.maxMsgSaveLimit == null) config.maxMsgSaveLimit = 10_000;
  if (config.deleteMsgCountPerTime == null) config.deleteMsgCountPerTime = 500;

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

  updateImageSaveDir();
  registerIpcHandlers();
  await initStorageIfNeeded();

  (qwqnt as any).main.hooks.whenBrowserWindowCreated.peek((w: BrowserWindow) => patchWindow(w));
  for (const w of BrowserWindow.getAllWindows()) {
    if (w && !w.isDestroyed()) patchWindow(w);
  }
}

void init();