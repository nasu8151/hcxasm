const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

// COMポート管理（スキャン結果と選択状態）
let availablePorts = [];
let selectedComPort = null;

// --- Python仮想環境の用意 ---
function getVenvPaths() {
  const venvRoot = path.join(app.getPath('userData'), 'python-venv');
  const pythonExe = process.platform === 'win32'
    ? path.join(venvRoot, 'Scripts', 'python.exe')
    : path.join(venvRoot, 'bin', 'python');
  const pipExe = process.platform === 'win32'
    ? path.join(venvRoot, 'Scripts', 'pip.exe')
    : path.join(venvRoot, 'bin', 'pip');
  return { venvRoot, pythonExe, pipExe };
}

function chooseSystemPython() {
  const candidates = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python', 'py'];
  for (const cmd of candidates) {
    const r = spawnSync(cmd, ['--version'], { windowsHide: true });
    if (!r.error && r.status === 0) return cmd;
  }
  return null;
}

async function ensurePythonEnv() {
  try {
    const { venvRoot, pythonExe, pipExe } = getVenvPaths();
    // 既存チェック
    if (!fs.existsSync(pythonExe)) {
      const sysPy = chooseSystemPython();
      if (!sysPy) {
        console.error('[ERROR] Python 3.x が見つかりません');
        return; // 起動は継続、エクスポート時に詳細エラーを返す
      }
      // venv作成
      const mk = spawnSync(sysPy, ['-m', 'venv', venvRoot], { windowsHide: true });
      if (mk.status !== 0) {
        console.error('[ERROR] venv作成に失敗:', mk.stderr?.toString() || '');
        return;
      }
    }
    // pip確認・アップグレード
    if (fs.existsSync(pythonExe)) {
      spawnSync(pythonExe, ['-m', 'pip', '--version'], { windowsHide: true });
      spawnSync(pythonExe, ['-m', 'pip', 'install', '--upgrade', 'pip'], { windowsHide: true });
      // 必要パッケージのインストール
      const requiredPackages = ['pyserial'];
      for (const pkg of requiredPackages) {
        spawnSync(pythonExe, ['-m', 'pip', 'install', pkg], { windowsHide: true });
      }

    }
  } catch (e) {
    console.error('[ERROR] ensurePythonEnv中に例外:', e);
  }
}

// COMポートをpyserialで列挙
function scanComPorts() {
  try {
    const { pythonExe } = getVenvPaths();
    let pythonCmd = null;
    if (fs.existsSync(pythonExe)) {
      pythonCmd = pythonExe;
    } else {
      pythonCmd = chooseSystemPython();
    }
    if (!pythonCmd) {
      return { success: false, error: 'Pythonが見つかりません（pyserialで列挙不可）' };
    }
    const script = [
      'import json',
      'import serial.tools.list_ports as lp',
      'res=[{"device":p.device,"description":getattr(p,"description",None),"hwid":getattr(p,"hwid",None)} for p in lp.comports()]',
      'print(json.dumps(res))'
    ].join('\n');
    const r = spawnSync(pythonCmd, ['-c', script], { windowsHide: true });
    if (r.status === 0) {
      try {
        const list = JSON.parse((r.stdout||'').toString());
        availablePorts = Array.isArray(list) ? list : [];
        // 既存の選択が無ければ最初を選択
        if (!selectedComPort && availablePorts.length) {
          selectedComPort = availablePorts[0];
        }
        return { success: true, ports: availablePorts };
      } catch (e) {
        return { success: false, error: 'ポート一覧の解析に失敗: ' + e.message };
      }
    }
    return { success: false, error: (r.stderr||'').toString() || 'pyserial列挙が失敗しました' };
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
          click: () => {
            const res = scanComPorts();
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

  // メニューバーを設定
  const menu = createMenu(mainWindow);
  Menu.setApplicationMenu(menu);

  // HTMLファイルをロード
  const htmlFile = path.join(__dirname, 'index.html');
  mainWindow.loadFile(htmlFile);

  // ウィンドウが準備できたら表示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 開発者ツールを開く（開発時のみ）
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// アプリが準備完了したときに実行
app.whenReady().then(async () => {
  // 起動時に仮想環境を確認・作成
  await ensurePythonEnv();
  createWindow();
});

// 全てのウィンドウが閉じられたとき
app.on('window-all-closed', () => {
  // macOS以外では、全ウィンドウが閉じられたらアプリを終了
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// デバイスへアップロード
ipcMain.handle('upload-to-device', async (event, assemblyCode, architecture) => {
  try {
    if (!selectedComPort || !selectedComPort.device) {
      return { success: false, error: 'COMポートが選択されていません。Sketch > Scan/Select から選択してください。' };
    }

    // venv優先でPython
    const { pythonExe } = getVenvPaths();
    let pythonCmd = null;
    if (fs.existsSync(pythonExe)) pythonCmd = pythonExe; else pythonCmd = chooseSystemPython();
    if (!pythonCmd) return { success: false, error: 'Pythonランタイムが見つかりません。Python 3.x をインストールしてください。' };

    const tmpDir = app.getPath('temp');
    const asmPath = path.join(tmpDir, `va_${Date.now()}.asm`);
    const hexPath = path.join(tmpDir, `va_${Date.now()}.hex`);
    fs.writeFileSync(asmPath, assemblyCode, 'utf8');

    // 1) アセンブル（ihex）
    const hcxasmPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app', 'hcxasm.py')
      : path.join(__dirname, 'hcxasm.py');
    if (!fs.existsSync(hcxasmPath)) {
      try { fs.unlinkSync(asmPath); } catch (_) {}
      return { success: false, error: 'hcxasm.py が見つかりません。' };
    }
    const archArg = (architecture === 'HC4E') ? 'HC4E' : 'HC4';
    const assembleArgs = [hcxasmPath, asmPath, '-o', hexPath, '-f', 'ihex', '-a', archArg];
    const asmProc = spawnSync(pythonCmd, assembleArgs, { cwd: path.dirname(hcxasmPath), windowsHide: true, encoding: 'utf8' });
    if (asmProc.status !== 0) {
      try { fs.unlinkSync(asmPath); } catch (_) {}
      return { success: false, error: `アセンブル失敗:\n${asmProc.stderr || asmProc.stdout || 'unknown error'}` };
    }

    // 2) アップロード（load4e.py）
    const loaderPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app', 'load4e.py')
      : path.join(__dirname, 'load4e.py');
    if (!fs.existsSync(loaderPath)) {
      try { fs.unlinkSync(asmPath); } catch (_) {}
      try { fs.unlinkSync(hexPath); } catch (_) {}
      return { success: false, error: 'load4e.py が見つかりません。' };
    }
    const port = selectedComPort.device;
    const loadArgs = [loaderPath, hexPath, '--port', port];
    const loadProc = spawnSync(pythonCmd, loadArgs, { cwd: path.dirname(loaderPath), windowsHide: true, encoding: 'utf8' });

    // 後始末
    try { fs.unlinkSync(asmPath); } catch (_) {}
    try { fs.unlinkSync(hexPath); } catch (_) {}

    if (loadProc.status !== 0) {
      return { success: false, error: `書き込み失敗:\n${loadProc.stderr || loadProc.stdout || 'unknown error'}` };
    }

    return { success: true, output: loadProc.stdout || '' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// アプリがアクティブになったとき（macOS用）
app.on('activate', () => {
  // macOSでは、アプリがアクティブになってウィンドウがない場合、新しいウィンドウを作成
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
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

  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, content, 'utf8');
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  return { success: false, canceled: true };
});

// ブロックファイル保存のIPCハンドラ
ipcMain.handle('save-blocks-file', async (event, content, filePath = null) => {
  let result;
  
  if (filePath) {
    // 既存のファイルに上書き保存
    result = { canceled: false, filePath: filePath };
  } else {
    // 名前を付けて保存
    result = await dialog.showSaveDialog({
      title: 'ブロックファイルを保存',
      defaultPath: 'workspace.vasm',
      filters: [
        { name: 'Visual Assembler Files', extensions: ['vasm'] },
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
  }

  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, content, 'utf8');
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  return { success: false, canceled: true };
});

// 新しいラベル作成用ダイアログ
ipcMain.handle('show-label-dialog', async (event, defaultValue) => {
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: '新しいラベルを作成',
    message: '新しいラベル名を入力してください:',
    defaultId: 0,
    buttons: ['OK', 'キャンセル'],
    detail: 'デフォルト: ' + defaultValue
  });
  
  if (response === 0) {
    // 簡易的な入力ダイアログの代替
    return { success: true, value: defaultValue };
  }
  
  return { success: false, canceled: true };
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
    // venv優先でPythonを選択
    const { pythonExe } = getVenvPaths();
    let pythonCmd = null;
    if (fs.existsSync(pythonExe)) {
      pythonCmd = pythonExe;
    } else {
      pythonCmd = chooseSystemPython();
    }
    if (!pythonCmd) {
      return { success: false, error: 'Pythonランタイムが見つかりません。Python 3.x をインストールしてください。' };
    }

    // 一時的なアセンブリファイルを作成（OSのtemp領域）
    const tempAsmPath = path.join(app.getPath('temp'), `temp_assembly_${Date.now()}.asm`);
    fs.writeFileSync(tempAsmPath, assemblyCode, 'utf8');

    // hcxasm.pyのパス（パッケージ時は resources/app 直下、開発時はソース直下）
    const hcxasmPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app', 'hcxasm.py')
      : path.join(__dirname, 'hcxasm.py');
    
    // hcxasm.pyが存在するかチェック
    if (!fs.existsSync(hcxasmPath)) {
      // 一時ファイルを削除
      fs.unlinkSync(tempAsmPath);
      return { 
        success: false, 
        error: 'hcxasm.pyが見つかりません。パス: ' + hcxasmPath 
      };
    }

    // hcxasm.pyを実行してアセンブル
    return new Promise((resolve) => {
      // ファイル拡張子に基づいて出力形式を決定
      const fileExt = path.extname(result.filePath).toLowerCase();
      const args = [hcxasmPath, tempAsmPath, '-o', result.filePath];
      // アーキテクチャ指定（デフォルトHC4）
      const archArg = (architecture === 'HC4E') ? 'HC4E' : 'HC4';
      args.push('-a', archArg);
      
      // 拡張子に応じて形式オプションを追加
      if (fileExt === '.hex') {
        args.push('-f', 'ihex');
      } else if (fileExt === '.txt') {
        args.push('-f', 'text');
      }
      // .binの場合はデフォルトのbinary形式なので何も追加しない
      
      const pythonProcess = spawn(pythonCmd, args, {
        cwd: path.dirname(hcxasmPath),
        windowsHide: true
      });

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

        if (code === 0) {
          resolve({ 
            success: true, 
            filePath: result.filePath,
            output: stdout 
          });
        } else {
          resolve({ 
            success: false, 
            error: `アセンブルに失敗しました (終了コード: ${code})\n${stderr || stdout}` 
          });
        }
      });

      pythonProcess.on('error', (err) => {
        // 一時ファイルを削除
        try {
          fs.unlinkSync(tempAsmPath);
        } catch (e) {
          console.error('一時ファイルの削除に失敗:', e);
        }
        
        resolve({ 
          success: false, 
          error: 'Pythonの実行に失敗しました: ' + err.message 
        });
      });
    });

  } catch (error) {
    return { 
      success: false, 
      error: 'ファイル操作に失敗しました: ' + error.message 
    };
  }
});
