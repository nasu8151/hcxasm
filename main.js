const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { pathToFileURL } = require('url');
const { spawn, spawnSync } = require('child_process');

const PORTABLE_PYTHON_VERSION = '3.12.4';
const PORTABLE_PYTHON_BASE_URL = 'https://www.python.org/ftp/python';
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';

// COMポート管理（スキャン結果と選択状態）
let availablePorts = [];
let selectedComPort = null;

// トレースプロセス管理
let traceProcess = null;
let traceTarget = null; // WebContents

// 未保存状態の管理（webContents.id -> boolean）
const windowDirtyState = new Map();

// アーキテクチャ選択（HC4 / HC4E）
let currentArchitecture = 'HC4E';

const BLOCKLY_CDN_URL = 'https://unpkg.com/blockly/blockly.min.js';

// Python環境準備状態
let pythonEnvStatus = 'idle'; // idle | preparing | ready | failed
let pythonEnvError = null;
let pythonEnvPromise = null;

// --- ポータブルPythonの用意 ---
function getPortablePythonPaths() {
  const runtimeRoot = path.join(app.getPath('userData'), 'python-portable');
  const pythonExe = process.platform === 'win32'
    ? path.join(runtimeRoot, 'python.exe')
    : path.join(runtimeRoot, 'bin', 'python3');
  const pipExe = process.platform === 'win32'
    ? path.join(runtimeRoot, 'Scripts', 'pip.exe')
    : path.join(runtimeRoot, 'bin', 'pip3');
  const versionMarker = path.join(runtimeRoot, '.python-version');
  const getPipPath = path.join(runtimeRoot, 'get-pip.py');
  return { runtimeRoot, pythonExe, pipExe, versionMarker, getPipPath };
}

function chooseSystemPython() {
  const candidates = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python', 'py'];
  for (const cmd of candidates) {
    const r = spawnSync(cmd, ['--version'], { windowsHide: true });
    if (!r.error && r.status === 0) return cmd;
  }
  return null;
}

function spawnAsync(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { windowsHide: true, ...options });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      resolve({ status: code, stdout, stderr, error: code !== 0 ? new Error(`Exited with ${code}`) : null });
    });
    
    proc.on('error', (err) => {
      resolve({ status: -1, stdout, stderr, error: err });
    });
  });
}

function getBlocklyCachePath() {
  return path.join(app.getPath('userData'), 'assets-cache', 'blockly.min.js');
}

function getBlocklyScriptSrc() {
  const cachePath = getBlocklyCachePath();
  if (fs.existsSync(cachePath)) {
    return pathToFileURL(cachePath).toString();
  }
  return BLOCKLY_CDN_URL;
}

function downloadToFile(url, filePath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('redirect limit exceeded'));
      return;
    }

    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        let nextUrl = null;
        try {
          nextUrl = new URL(res.headers.location, url).toString();
        } catch (e) {
          reject(new Error(`invalid redirect URL: ${res.headers.location}`));
          return;
        }
        downloadToFile(nextUrl, filePath, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`download failed with status ${res.statusCode}`));
        return;
      }

      const tmpPath = `${filePath}.tmp`;
      const out = fs.createWriteStream(tmpPath);
      res.pipe(out);

      out.on('finish', () => {
        out.close(() => {
          try {
            fs.renameSync(tmpPath, filePath);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });

      out.on('error', (e) => {
        try {
          out.close(() => {
            try { fs.unlinkSync(tmpPath); } catch (_) {}
            reject(e);
          });
        } catch (_) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('download timeout'));
    });
  });
}

function getPortablePythonDownloadUrl() {
  if (process.platform !== 'win32') return null;
  let suffix = null;
  if (process.arch === 'x64') {
    suffix = 'embed-amd64.zip';
  } else if (process.arch === 'arm64') {
    suffix = 'embed-arm64.zip';
  } else if (process.arch === 'ia32') {
    suffix = 'embed-win32.zip';
  }
  if (!suffix) return null;
  return `${PORTABLE_PYTHON_BASE_URL}/${PORTABLE_PYTHON_VERSION}/python-${PORTABLE_PYTHON_VERSION}-${suffix}`;
}

function readVersionMarker(versionMarker) {
  try {
    return fs.readFileSync(versionMarker, 'utf8').trim();
  } catch (_) {
    return null;
  }
}

async function extractZip(archivePath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });

  const tarResult = await spawnAsync('tar', ['-xf', archivePath, '-C', destDir]);
  if (tarResult.status === 0) {
    return { success: true };
  }

  if (process.platform === 'win32') {
    const psArchive = archivePath.replace(/'/g, "''");
    const psDest = destDir.replace(/'/g, "''");
    const cmd = `Expand-Archive -LiteralPath '${psArchive}' -DestinationPath '${psDest}' -Force`;
    const psResult = await spawnAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd]);
    if (psResult.status === 0) {
      return { success: true };
    }
    return { success: false, error: psResult.stderr || (psResult.error ? psResult.error.message : '') || 'Expand-Archive failed' };
  }

  const unzipResult = await spawnAsync('unzip', ['-o', archivePath, '-d', destDir]);
  if (unzipResult.status === 0) {
    return { success: true };
  }
  return { success: false, error: unzipResult.stderr || (unzipResult.error ? unzipResult.error.message : '') || 'unzip failed' };
}

function enableEmbeddableSitePackages(runtimeRoot) {
  let pthFile = null;
  try {
    pthFile = fs.readdirSync(runtimeRoot).find((name) => name.toLowerCase().endsWith('._pth')) || null;
  } catch (_) {
    return;
  }
  if (!pthFile) return;

  const pthPath = path.join(runtimeRoot, pthFile);
  let content = '';
  try {
    content = fs.readFileSync(pthPath, 'utf8');
  } catch (_) {
    return;
  }

  const lines = content.split(/\r?\n/);
  let siteIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed === '#import site' || trimmed === 'import site';
  });
  let changed = false;

  if (siteIndex === -1) {
    lines.push('import site');
    siteIndex = lines.length - 1;
    changed = true;
  } else if (lines[siteIndex].trim() === '#import site') {
    lines[siteIndex] = 'import site';
    changed = true;
  }

  const hasSitePackages = lines.some((line) => line.trim().toLowerCase() === 'lib\\site-packages');
  if (!hasSitePackages) {
    lines.splice(siteIndex, 0, 'Lib\\site-packages');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(pthPath, lines.join('\n'), 'utf8');
  }

  fs.mkdirSync(path.join(runtimeRoot, 'Lib', 'site-packages'), { recursive: true });
}

async function ensurePipInstalled(pythonExe, runtimeRoot, updateSplash) {
  const pipEnv = { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1', PYTHONIOENCODING: 'utf-8' };
  const check = await spawnAsync(pythonExe, ['-m', 'pip', '--version'], { env: pipEnv });
  if (check.status === 0) return;

  if (!runtimeRoot) {
    throw new Error('pipが見つかりません。');
  }

  if (updateSplash) {
    updateSplash('pipをインストール中...', 60);
  }

  const getPipPath = path.join(runtimeRoot, 'get-pip.py');
  if (!fs.existsSync(getPipPath)) {
    await downloadToFile(GET_PIP_URL, getPipPath);
  }

  const install = await spawnAsync(pythonExe, [getPipPath], { env: pipEnv });
  if (install.status !== 0) {
    throw new Error(`pipインストールに失敗: ${install.stderr || install.stdout || 'unknown error'}`);
  }
}

async function ensurePythonPackages(pythonExe, runtimeRoot, updateSplash) {
  await ensurePipInstalled(pythonExe, runtimeRoot, updateSplash);

  if (updateSplash) {
    updateSplash('必要パッケージを確認中...', 70);
  }

  const pipEnv = { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1', PYTHONIOENCODING: 'utf-8' };
  const requiredPackages = ['pyserial'];
  for (let i = 0; i < requiredPackages.length; i++) {
    const pkg = requiredPackages[i];
    const progress = 75 + Math.floor(20 * ((i + 1) / requiredPackages.length));
    const check = await spawnAsync(pythonExe, ['-m', 'pip', 'show', pkg], { env: pipEnv });
    if (check.status !== 0) {
      if (updateSplash) {
        updateSplash(`パッケージ '${pkg}' をインストール中...`, progress - 5);
      }
      const install = await spawnAsync(pythonExe, ['-m', 'pip', 'install', pkg], { env: pipEnv });
      if (install.status !== 0) {
        throw new Error(`パッケージ '${pkg}' のインストールに失敗: ${install.stderr || 'unknown error'}`);
      }
    }
    if (updateSplash) {
      updateSplash(`パッケージ '${pkg}' 確認完了`, progress);
    }
  }
}

function resolvePythonCommand() {
  const { pythonExe } = getPortablePythonPaths();
  if (process.platform === 'win32') {
    return fs.existsSync(pythonExe) ? pythonExe : null;
  }
  if (fs.existsSync(pythonExe)) return pythonExe;
  return chooseSystemPython();
}

async function ensurePortablePython(updateSplash) {
  if (process.platform !== 'win32') return;

  const { runtimeRoot, pythonExe, versionMarker } = getPortablePythonPaths();
  const currentVersion = readVersionMarker(versionMarker);
  if (currentVersion === PORTABLE_PYTHON_VERSION && fs.existsSync(pythonExe)) {
    return;
  }

  const url = getPortablePythonDownloadUrl();
  if (!url) {
    throw new Error('対応するポータブルPythonの配布が見つかりません。');
  }

  if (updateSplash) {
    updateSplash('ポータブルPythonをダウンロード中...', 30);
  }

  const zipPath = path.join(app.getPath('temp'), `python-${PORTABLE_PYTHON_VERSION}-${process.arch}.zip`);
  await downloadToFile(url, zipPath);

  if (updateSplash) {
    updateSplash('ポータブルPythonを展開中...', 45);
  }

  try {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  } catch (_) {
    // ignore
  }
  fs.mkdirSync(runtimeRoot, { recursive: true });

  const extract = await extractZip(zipPath, runtimeRoot);
  if (!extract.success) {
    throw new Error(`ポータブルPythonの展開に失敗: ${extract.error || 'unknown error'}`);
  }

  if (!fs.existsSync(pythonExe)) {
    throw new Error('ポータブルPythonの展開後にpython.exeが見つかりません。');
  }

  if (updateSplash) {
    updateSplash('ポータブルPythonを設定中...', 55);
  }

  enableEmbeddableSitePackages(runtimeRoot);
  fs.writeFileSync(versionMarker, PORTABLE_PYTHON_VERSION, 'utf8');

  try {
    fs.unlinkSync(zipPath);
  } catch (_) {
    // ignore
  }
}

async function ensureBlocklyCached() {
  const cachePath = getBlocklyCachePath();
  if (fs.existsSync(cachePath)) {
    return { cached: true, path: cachePath };
  }

  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  try {
    await downloadToFile(BLOCKLY_CDN_URL, cachePath);
    console.log('[INFO] Blockly cached at:', cachePath);
    return { cached: true, path: cachePath };
  } catch (e) {
    console.warn('[WARN] Blockly cache download failed:', e.message);
    return { cached: false, error: e.message };
  }
}

async function ensurePythonEnv(splashWindow) {
  if (pythonEnvPromise) {
    return pythonEnvPromise;
  }

  const updateSplash = (msg, progress) => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('progress', { message: msg, progress });
    }
  };

  pythonEnvStatus = 'preparing';
  pythonEnvError = null;

  pythonEnvPromise = (async () => {
    try {
      const prepStart = Date.now();

      updateSplash('Python環境を確認中...', 10);

      if (process.platform === 'win32') {
        updateSplash('ポータブルPythonを準備中...', 20);
        await ensurePortablePython(updateSplash);
      }

      const { runtimeRoot } = getPortablePythonPaths();
      const pythonCmd = resolvePythonCommand();
      if (!pythonCmd) {
        const errMsg = (process.platform === 'win32')
          ? 'ポータブルPythonの準備に失敗しました。'
          : 'Python 3.x が見つかりません。';
        console.error('[ERROR] ' + errMsg);
        updateSplash(errMsg + ' 起動を継続します。', 100);
        pythonEnvStatus = 'failed';
        pythonEnvError = errMsg;
        return;
      }

      await ensurePythonPackages(
        pythonCmd,
        process.platform === 'win32' ? runtimeRoot : null,
        updateSplash
      );

      pythonEnvStatus = 'ready';
      console.log(`[PERF] ensurePythonEnv finished in ${Date.now() - prepStart}ms`);
      updateSplash('起動準備完了', 100);
    } catch (e) {
      console.error('[ERROR] ensurePythonEnv中に例外:', e);
      pythonEnvStatus = 'failed';
      pythonEnvError = e.message;
      updateSplash('Python環境準備に失敗しました。', 100);
    }
  })();

  return pythonEnvPromise;
}

// COMポートをpyserialで列挙
async function scanComPorts() {
  try {
    const scanStart = Date.now();
    if (pythonEnvPromise && pythonEnvStatus === 'preparing') {
      await pythonEnvPromise;
    }

    const pythonCmd = resolvePythonCommand();
    if (!pythonCmd) {
      return { success: false, error: 'Pythonランタイムが見つかりません（pyserialで列挙不可）' };
    }
    const script = [
      'import json',
      'import serial.tools.list_ports as lp',
      'res=[{"device":p.device,"description":getattr(p,"description",None),"hwid":getattr(p,"hwid",None)} for p in lp.comports()]',
      'print(json.dumps(res))'
    ].join('\n');
    const r = await spawnAsync(pythonCmd, ['-c', script]);
    if (r.status === 0) {
      try {
        const list = JSON.parse((r.stdout || '').toString());
        availablePorts = Array.isArray(list) ? list : [];
        // 既存の選択が無ければ最初を選択
        if (!selectedComPort && availablePorts.length) {
          selectedComPort = availablePorts[0];
        }
        console.log(`[PERF] scanComPorts finished in ${Date.now() - scanStart}ms`);
        return { success: true, ports: availablePorts };
      } catch (e) {
        return { success: false, error: 'ポート一覧の解析に失敗: ' + e.message };
      }
    }
    return { success: false, error: (r.stderr || '').toString() || 'pyserial列挙が失敗しました' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// メニューテンプレートを作成
function createMenu(mainWindow) {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            // 新しいワークスペースを作成
            mainWindow.webContents.send('menu-action', 'new');
          }
        },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            // ブロックファイルを開く
            const result = await dialog.showOpenDialog(mainWindow, {
              title: 'ブロックファイルを開く',
              filters: [
                { name: 'Visual Assembler Files', extensions: ['vasm'] },
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });

            if (!result.canceled && result.filePaths[0]) {
              try {
                const content = fs.readFileSync(result.filePaths[0], 'utf8');
                mainWindow.webContents.send('menu-action', 'open', {
                  content: content,
                  filePath: result.filePaths[0]
                });
              } catch (error) {
                dialog.showErrorBox('エラー', 'ファイルの読み込みに失敗しました: ' + error.message);
              }
            }
          }
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            // ブロックを保存
            mainWindow.webContents.send('menu-action', 'save');
          }
        },
        {
          label: 'Save as...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            // ブロックを名前を付けて保存
            mainWindow.webContents.send('menu-action', 'save-as');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Sketch',
      submenu: [
        {
          label: 'Scan COM Ports',
          click: async () => {
            const res = await scanComPorts();
            if (!res.success) {
              dialog.showErrorBox('COMポート検索エラー', res.error);
            }
            // レンダラーへ通知
            mainWindow.webContents.send('com-ports', availablePorts);
            // メニューを最新のポートで更新
            Menu.setApplicationMenu(createMenu(mainWindow));
          }
        },
        {
          label: 'Select COM Port',
          submenu: (availablePorts.length
            ? availablePorts.map(p => ({
                label: `${p.device}${p.description ? ' ('+p.description+')' : ''}`,
                type: 'radio',
                checked: !!(selectedComPort && selectedComPort.device === p.device),
                click: () => {
                  selectedComPort = p;
                  mainWindow.webContents.send('com-port-selected', p);
                }
              }))
            : [{ label: 'No ports', enabled: false }]
          )
        },
        {
          label: 'Architecture',
          submenu: [
            {
              label: 'HC4',
              type: 'radio',
              checked: currentArchitecture === 'HC4',
              click: () => {
                currentArchitecture = 'HC4';
                mainWindow.webContents.send('architecture-changed', 'HC4');
                Menu.setApplicationMenu(createMenu(mainWindow));
              }
            },
            {
              label: 'HC4E',
              type: 'radio',
              checked: currentArchitecture === 'HC4E',
              click: () => {
                currentArchitecture = 'HC4E';
                mainWindow.webContents.send('architecture-changed', 'HC4E');
                Menu.setApplicationMenu(createMenu(mainWindow));
              }
            }
          ]
        },
        {
          label: 'Export as assembly',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            // アセンブリとしてエクスポート
            mainWindow.webContents.send('menu-action', 'export-assembly');
          }
        },
        {
          label: 'Export Assembled Binary',
          accelerator: 'CmdOrCtrl+Alt+S',
          click: () => {
            // アセンブルしてバイナリをエクスポート
            mainWindow.webContents.send('menu-action', 'export-binary');
          }
        },
        { type: 'separator' },
        {
          label: 'Upload to HC4E',
          accelerator: 'CmdOrCtrl+U',
          click: () => {
            // 現在のワークスペースをアップロード
            mainWindow.webContents.send('menu-action', 'upload');
          }
        }
      ]
    }
  ];

  // macOSの場合はアプリケーションメニューを追加
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  return Menu.buildFromTemplate(template);
}

function createWindow() {
  // メインウィンドウを作成
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png'), // アイコンがあれば
    show: false // 準備ができるまで非表示
  });

  const webContentsId = mainWindow.webContents.id;
  windowDirtyState.set(webContentsId, false);

  // HTMLファイルをロード
  const htmlFile = path.join(__dirname, 'index.html');
  mainWindow.loadFile(htmlFile, {
    query: { blocklySrc: getBlocklyScriptSrc() }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('architecture-changed', currentArchitecture);
  });

  // ウィンドウが準備できたら表示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // 初期表示を優先し、メニュー設定やCOMスキャンは表示後に実行
    setImmediate(async () => {
      Menu.setApplicationMenu(createMenu(mainWindow));
      const res = await scanComPorts();
      if (res.success) {
        mainWindow.webContents.send('com-ports', availablePorts);
        Menu.setApplicationMenu(createMenu(mainWindow));
      }
    });
  });

  // 開発者ツールを開く（開発時のみ）
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('close', (e) => {
    if (mainWindow.isDestroyed()) return;
    const isDirty = windowDirtyState.get(webContentsId);
    if (!isDirty) return;

    const result = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: '未保存の変更があります',
      message: '保存されていない変更があります。閉じますか？',
      buttons: ['キャンセル', '閉じる'],
      defaultId: 0,
      cancelId: 0
    });

    if (result === 0) {
      e.preventDefault();
      return;
    }
    windowDirtyState.set(webContentsId, false);
  });

  mainWindow.on('closed', () => {
    windowDirtyState.delete(webContentsId);
  });
}

// アプリが準備完了したときに実行
app.whenReady().then(async () => {
  const startupBegin = Date.now();

  // Blocklyが無い場合は起動中にキャッシュを作成（次回起動でローカル利用）
  ensureBlocklyCached();

  // スプラッシュ画面の作成
  const splashWindow = new BrowserWindow({
    width: 450,
    height: 350,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-splash.js')
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));

  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });

  // メインウィンドウを先に表示し、Python環境準備はバックグラウンド化
  createWindow();
  ensurePythonEnv(splashWindow).catch((e) => {
    console.error('[ERROR] バックグラウンドPython準備に失敗:', e);
  });

  // メインウィンドウが表示されるタイミングまで待つ
  const mainWindow = BrowserWindow.getAllWindows().find(win => win !== splashWindow);
  if (mainWindow) {
    mainWindow.once('ready-to-show', () => {
      console.log(`[PERF] ready-to-show in ${Date.now() - startupBegin}ms`);
      if (!splashWindow.isDestroyed()) {
        splashWindow.destroy();
      }
    });
  } else {
    if (!splashWindow.isDestroyed()) {
      splashWindow.destroy();
    }
  }
});

// 全てのウィンドウが閉じられたとき
app.on('window-all-closed', () => {
  // macOS以外では、全ウィンドウが閉じられたらアプリを終了
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// デバイスへアップロード（クリーン版）
ipcMain.handle('upload-to-device', async (event, assemblyCode, architecture) => {
  try {
    if (pythonEnvPromise && pythonEnvStatus === 'preparing') {
      await pythonEnvPromise;
    }
    if (pythonEnvStatus === 'failed' && !resolvePythonCommand()) {
      return { success: false, error: pythonEnvError || 'Python環境準備に失敗しました。' };
    }

    if (!selectedComPort || !selectedComPort.device) {
      return { success: false, error: 'COMポートが選択されていません。Sketch > Scan/Select から選択してください。' };
    }

    // ポータブルPythonを選択
    const pythonCmd = resolvePythonCommand();
    if (!pythonCmd) {
      return { success: false, error: 'Pythonランタイムが見つかりません。' };
    }

    const tmpDir = app.getPath('temp');
    const logs = [];
    const fmtCmd = (cmd, args) => {
      const quote = s => (typeof s === 'string' && s.includes(' ')) ? `"${s}"` : `${s}`;
      return [quote(cmd), ...args.map(quote)].join(' ');
    };

    const asmPath = path.join(tmpDir, `va_${Date.now()}.asm`);
    const hexPath = path.join(tmpDir, `va_${Date.now()}.hex`);
    fs.writeFileSync(asmPath, assemblyCode, 'utf8');

    // 1) アセンブル（ihex）
    const hcxasmPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'hcxasm.py')
      : path.join(__dirname, 'hcxasm.py');
    if (!fs.existsSync(hcxasmPath)) {
      try { fs.unlinkSync(asmPath); } catch (_) {}
      return { success: false, error: 'hcxasm.py が見つかりません。' };
    }

    const archArg = (architecture === 'HC4E') ? 'HC4E' : 'HC4';
    const assembleArgs = [hcxasmPath, asmPath, '-o', hexPath, '-f', 'ihex', '-a', archArg, '-v'];
    logs.push('Assembler command: ' + fmtCmd(pythonCmd, assembleArgs));
    const asmProc = spawnSync(pythonCmd, assembleArgs, {
      cwd: path.dirname(hcxasmPath),
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    logs.push('Assembler exit code: ' + asmProc.status);
    if (asmProc.stdout) logs.push('Assembler stdout:\n' + asmProc.stdout.trim());
    if (asmProc.stderr) logs.push('Assembler stderr:\n' + asmProc.stderr.trim());
    if (asmProc.status !== 0) {
      try { fs.unlinkSync(asmPath); } catch (_) {}
      return { success: false, error: `アセンブル失敗:\n${asmProc.stderr || asmProc.stdout || 'unknown error'}`, logs };
    }

    // 2) アップロード（load4e.py）
    const loaderPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'load4e.py')
      : path.join(__dirname, 'load4e.py');
    if (!fs.existsSync(loaderPath)) {
      try { fs.unlinkSync(asmPath); } catch (_) {}
      try { fs.unlinkSync(hexPath); } catch (_) {}
      return { success: false, error: 'load4e.py が見つかりません。' };
    }
    const port = selectedComPort.device;
    const loadArgs = [loaderPath, 'load', '--file', hexPath, '--port', port];
    logs.push('Loader command: ' + fmtCmd(pythonCmd, loadArgs));
    const loadProc = spawnSync(pythonCmd, loadArgs, {
      cwd: path.dirname(loaderPath),
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    logs.push('Loader exit code: ' + loadProc.status);
    if (loadProc.stdout) logs.push('Loader stdout:\n' + loadProc.stdout.trim());
    if (loadProc.stderr) logs.push('Loader stderr:\n' + loadProc.stderr.trim());

    // 後始末
    try { fs.unlinkSync(asmPath); } catch (_) {}
    try { fs.unlinkSync(hexPath); } catch (_) {}

    if (loadProc.status !== 0) {
      return { success: false, error: `書き込み失敗:\n${loadProc.stderr || loadProc.stdout || 'unknown error'}`, logs };
    }

    return { success: true, output: loadProc.stdout || '', logs };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ワークスペースの未保存状態を更新
ipcMain.on('workspace-dirty', (event, isDirty) => {
  if (!event || !event.sender) return;
  windowDirtyState.set(event.sender.id, !!isDirty);
});

// アプリがアクティブになったとき（macOS用）
app.on('activate', () => {
  // macOSでは、アプリがアクティブになってウィンドウがない場合、新しいウィンドウを作成
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// レジスタ取得（load4e.py register）
ipcMain.handle('fetch-registers', async () => {
  try {
    if (pythonEnvPromise && pythonEnvStatus === 'preparing') {
      await pythonEnvPromise;
    }
    if (pythonEnvStatus === 'failed' && !resolvePythonCommand()) {
      return { success: false, error: pythonEnvError || 'Python環境準備に失敗しました。' };
    }

    if (!selectedComPort || !selectedComPort.device) {
      return { success: false, error: 'COMポートが選択されていません。Sketch > Scan/Select で選択してください。' };
    }
    // Pythonを選択（ポータブル優先）
    const pythonCmd = resolvePythonCommand();
    if (!pythonCmd) {
      return { success: false, error: 'Pythonランタイムが見つかりません。' };
    }

    const loaderPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'load4e.py')
      : path.join(__dirname, 'load4e.py');
    if (!fs.existsSync(loaderPath)) {
      return { success: false, error: 'load4e.py が見つかりません。' };
    }

    const args = [loaderPath, 'register', '--json', '--port', selectedComPort.device];
    const r = spawnSync(pythonCmd, args, {
      cwd: path.dirname(loaderPath),
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    if (r.status !== 0) {
      return { success: false, error: (r.stderr || r.stdout || 'register 実行に失敗しました') };
    }
    let data = null;
    try {
      data = JSON.parse(r.stdout || '{}');
    } catch (e) {
      return { success: false, error: 'JSON解析に失敗しました: ' + e.message, raw: r.stdout };
    }
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// トレース開始（load4e.py trace --json）
ipcMain.handle('start-trace', async (event) => {
  try {
    if (pythonEnvPromise && pythonEnvStatus === 'preparing') {
      await pythonEnvPromise;
    }
    if (pythonEnvStatus === 'failed' && !resolvePythonCommand()) {
      return { success: false, error: pythonEnvError || 'Python環境準備に失敗しました。' };
    }

    if (traceProcess) {
      return { success: true, alreadyRunning: true };
    }
    if (!selectedComPort || !selectedComPort.device) {
      return { success: false, error: 'COMポートが選択されていません。Sketch > Scan/Select で選択してください。' };
    }

    const pythonCmd = resolvePythonCommand();
    if (!pythonCmd) {
      return { success: false, error: 'Pythonランタイムが見つかりません。' };
    }

    const loaderPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'load4e.py')
      : path.join(__dirname, 'load4e.py');
    if (!fs.existsSync(loaderPath)) {
      return { success: false, error: 'load4e.py が見つかりません。' };
    }

    // CLI 実行と同じ形: load4e.py trace --port COMxx -j
    const args = [loaderPath, 'trace', '--port', selectedComPort.device, '-j'];
    const proc = spawn(pythonCmd, args, {
      cwd: path.dirname(loaderPath),
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' }
    });

    if (proc.stdout && proc.stdout.setEncoding) {
      proc.stdout.setEncoding('utf8');
    }
    if (proc.stderr && proc.stderr.setEncoding) {
      proc.stderr.setEncoding('utf8');
    }

    traceProcess = proc;
    traceTarget = event.sender;

    let buffer = '';
    proc.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (traceTarget && !traceTarget.isDestroyed()) {
            traceTarget.send('trace-update', obj);
          }
        } catch (e) {
          if (traceTarget && !traceTarget.isDestroyed()) {
            traceTarget.send('trace-error', 'JSON parse error: ' + e.message);
          }
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const msg = data.toString();
      if (traceTarget && !traceTarget.isDestroyed()) {
        traceTarget.send('trace-error', msg);
      }
    });

    const cleanup = (info) => {
      traceProcess = null;
      if (traceTarget && !traceTarget.isDestroyed()) {
        traceTarget.send('trace-stopped', info);
      }
      traceTarget = null;
    };

    proc.on('close', (code, signal) => {
      cleanup({ code, signal });
    });

    proc.on('error', (err) => {
      cleanup({ error: err.message });
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// トレース停止
ipcMain.handle('stop-trace', async () => {
  try {
    if (!traceProcess) {
      return { success: true, alreadyStopped: true };
    }
    try {
      // 終了要求として標準入力に "q\n" を送る
      if (traceProcess.stdin && !traceProcess.stdin.destroyed) {
        traceProcess.stdin.write('q\n', 'utf8', () => {
          try {
            traceProcess.stdin.end();
          } catch (e) {
            // ignore
          }
        });
      } else {
        // stdin が使えない場合のフォールバック
        traceProcess.kill();
      }
    } catch (e) {
      // ignore
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ファイル保存のIPCハンドラ
ipcMain.handle('save-assembly-file', async (event, content) => {
  const result = await dialog.showSaveDialog({
    title: 'アセンブリファイルを保存',
    defaultPath: 'program.asm',
    filters: [
      { name: 'Assembly Files', extensions: ['asm'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }

  try {
    fs.writeFileSync(result.filePath, content ?? '', 'utf8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: '保存に失敗しました: ' + err.message };
  }
});

// ブロック構成の保存（.vasm/.json）
ipcMain.handle('save-blocks-file', async (event, content, filePath) => {
  // filePath が渡されていれば上書き保存（Ctrl+S 用）
  if (filePath && typeof filePath === 'string') {
    try {
      fs.writeFileSync(filePath, content ?? '', 'utf8');
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: '保存に失敗しました: ' + err.message };
    }
  }

  // filePath がない場合はダイアログ表示（Save as 用）
  const result = await dialog.showSaveDialog({
    title: 'ブロックファイルを保存',
    defaultPath: 'program.vasm',
    filters: [
      { name: 'Visual Assembler Files', extensions: ['vasm'] },
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }

  try {
    fs.writeFileSync(result.filePath, content ?? '', 'utf8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: '保存に失敗しました: ' + err.message };
  }
});

// バイナリエクスポート用IPCハンドラ
ipcMain.handle('export-assembled-binary', async (event, assemblyCode, architecture) => {
  // バイナリファイルの保存先を選択
  const result = await dialog.showSaveDialog({
    title: 'アセンブルされたバイナリファイルを保存',
    defaultPath: 'program.bin',
    filters: [
      { name: 'Binary Files', extensions: ['bin'] },
      { name: 'Hex Files', extensions: ['hex'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }

  try {
    const logs = [];
    const fmtCmd = (cmd, args) => {
      const quote = s => (typeof s === 'string' && s.includes(' ')) ? `"${s}"` : `${s}`;
      return [quote(cmd), ...args.map(quote)].join(' ');
    };
    // ポータブルPythonを選択
    const pythonCmd = resolvePythonCommand();
    if (!pythonCmd) {
      return { success: false, error: 'Pythonランタイムが見つかりません。', logs };
    }

    // 一時的なアセンブリファイルを作成（OSのtemp領域）
    const tempAsmPath = path.join(app.getPath('temp'), `temp_assembly_${Date.now()}.asm`);
    fs.writeFileSync(tempAsmPath, assemblyCode, 'utf8');

    // hcxasm.pyのパス（パッケージ時は resources/app 直下、開発時はソース直下）
    const hcxasmPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'hcxasm.py')
      : path.join(__dirname, 'hcxasm.py');
    
    // hcxasm.pyが存在するかチェック
    if (!fs.existsSync(hcxasmPath)) {
      // 一時ファイルを削除
      fs.unlinkSync(tempAsmPath);
      return { 
        success: false, 
        error: 'hcxasm.pyが見つかりません。パス: ' + hcxasmPath,
        logs
      };
    }

    // hcxasm.pyを実行してアセンブル
    return new Promise((resolve) => {
      // ファイル拡張子に基づいて出力形式を決定
      const fileExt = path.extname(result.filePath).toLowerCase();
      const args = [hcxasmPath, tempAsmPath, '-o', result.filePath];
      // アーキテクチャ指定（デフォルトHC4）
      const archArg = (architecture === 'HC4E') ? 'HC4E' : 'HC4';
      args.push('-a', archArg, '-v');
      
      // 拡張子に応じて形式オプションを追加
      if (fileExt === '.hex') {
        args.push('-f', 'ihex');
      } else if (fileExt === '.txt') {
        args.push('-f', 'text');
      }
      // .binの場合はデフォルトのbinary形式なので何も追加しない
      logs.push('Assembler command: ' + fmtCmd(pythonCmd, args));
      const pythonProcess = spawn(pythonCmd, args, {
        cwd: path.dirname(hcxasmPath),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      // Pythonの出力ストリームをUTF-8で受け取る
      if (pythonProcess.stdout && pythonProcess.stdout.setEncoding) {
        pythonProcess.stdout.setEncoding('utf8');
      }
      if (pythonProcess.stderr && pythonProcess.stderr.setEncoding) {
        pythonProcess.stderr.setEncoding('utf8');
      }

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        // 一時ファイルを削除
        try {
          fs.unlinkSync(tempAsmPath);
        } catch (e) {
          console.error('一時ファイルの削除に失敗:', e);
        }

        logs.push('Assembler exit code: ' + code);
        if (stdout) logs.push('Assembler stdout:\n' + stdout.trim());
        if (stderr) logs.push('Assembler stderr:\n' + stderr.trim());
        if (code === 0) {
          resolve({ success: true, filePath: result.filePath, output: stdout, logs });
        } else {
          resolve({ success: false, error: `アセンブルに失敗しました (終了コード: ${code})\n${stderr || stdout}`, logs });
        }
      });

      pythonProcess.on('error', (err) => {
        // 一時ファイルを削除
        try {
          fs.unlinkSync(tempAsmPath);
        } catch (e) {
          console.error('一時ファイルの削除に失敗:', e);
        }
        logs.push('Assembler error: ' + err.message);
        resolve({ success: false, error: 'Pythonの実行に失敗しました: ' + err.message, logs });
      });
    });

  } catch (error) {
    return { success: false, error: 'ファイル操作に失敗しました: ' + error.message };
  }
});
