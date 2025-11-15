const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

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
app.whenReady().then(createWindow);

// 全てのウィンドウが閉じられたとき
app.on('window-all-closed', () => {
  // macOS以外では、全ウィンドウが閉じられたらアプリを終了
  if (process.platform !== 'darwin') {
    app.quit();
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
ipcMain.handle('export-assembled-binary', async (event, assemblyCode) => {
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
    // 一時的なアセンブリファイルを作成
    const tempAsmPath = path.join(__dirname, 'temp_assembly.asm');
    fs.writeFileSync(tempAsmPath, assemblyCode, 'utf8');

    // hcxasm.pyのパスを取得（開発時とビルド時で異なる）
    let hcxasmPath;
    if (app.isPackaged) {
      // ビルド済みアプリの場合、resources/app内から取得
      hcxasmPath = path.join(__dirname, 'hcxasm.py');
    } else {
      // 開発時は同じディレクトリから取得
      hcxasmPath = path.join(__dirname, 'hcxasm.py');
    }
    
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
      
      // 拡張子に応じて形式オプションを追加
      if (fileExt === '.hex') {
        args.push('-f', 'ihex');
      } else if (fileExt === '.txt') {
        args.push('-f', 'text');
      }
      // .binの場合はデフォルトのbinary形式なので何も追加しない
      
      const pythonProcess = spawn('py', args, {
        cwd: path.dirname(hcxasmPath)
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
