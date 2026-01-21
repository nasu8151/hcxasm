/**
 * HCx Series Visual Assembler - UI Functions
 * ビジュアルアセンブラのUI関連機能
 */

// 現在のファイルパス（Save機能用）
let currentFilePath = null;

// 出力タブにメッセージを表示する関数
function addOutputMessage(message, type = 'info') {
  const messageOutput = document.getElementById('messageOutput');
  if (!messageOutput) return;
  
  const timestamp = new Date().toLocaleTimeString();
  const prefix = type === 'error' ? '[ERROR]' : type === 'warning' ? '[WARNING]' : '[INFO]';
  const formattedMessage = `${timestamp} ${prefix} ${message}\n`;
  
  messageOutput.textContent += formattedMessage;
  messageOutput.scrollTop = messageOutput.scrollHeight; // 最下部にスクロール
}

// 出力タブをクリアする関数
function clearOutputMessages() {
  const messageOutput = document.getElementById('messageOutput');
  if (messageOutput) {
    messageOutput.textContent = '';
  }
}

// アセンブリファイル保存機能
async function saveAssemblyFile() {
  if (!window.vasmWorkspace) {
    alert('ワークスペースが初期化されていません。');
    return;
  }
  
  // 表示中タブと完全一致させるため getAssemblyCode を優先
  let code = '';
  if (typeof window.getAssemblyCode === 'function') {
    code = window.getAssemblyCode();
  } else {
    code = Blockly.Assembly.workspaceToCode(window.vasmWorkspace);
  }
  
  if (!code || code.trim() === '') {
    alert('保存するアセンブリコードがありません。ブロックを配置してください。');
    return;
  }

  // Electronが利用可能かチェック
  if (typeof window.electronAPI !== 'undefined') {
    try {
      const result = await window.electronAPI.saveAssemblyFile(code);
      if (result.success) {
        addOutputMessage(`アセンブリファイルが保存されました: ${result.filePath}`);
      } else if (result.canceled) {
        addOutputMessage('アセンブリファイルの保存がキャンセルされました');
      } else {
        addOutputMessage(`アセンブリファイルの保存に失敗しました: ${result.error}`, 'error');
        alert('ファイルの保存に失敗しました: ' + result.error);
      }
    } catch (error) {
      addOutputMessage(`アセンブリファイル保存中にエラーが発生しました: ${error.message}`, 'error');
      alert('ファイル保存中にエラーが発生しました: ' + error.message);
    }
  } else {
    // ブラウザ環境の場合はダウンロード機能を提供
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'program.asm';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// バイナリエクスポート機能
async function exportAssembledBinary() {
  if (!window.vasmWorkspace) {
    alert('ワークスペースが初期化されていません。');
    return;
  }
  
  // 表示中タブと完全一致させるため getAssemblyCode を優先
  let code = '';
  if (typeof window.getAssemblyCode === 'function') {
    code = window.getAssemblyCode();
  } else {
    code = Blockly.Assembly.workspaceToCode(window.vasmWorkspace);
  }
  
  if (!code || code.trim() === '') {
    alert('エクスポートするアセンブリコードがありません。ブロックを配置してください。');
    return;
  }

  // Electronが利用可能かチェック
  if (typeof window.electronAPI !== 'undefined') {
    try {
      // 処理中であることを表示
      addOutputMessage('アセンブル処理を開始します...');
      console.log('[INFO] アセンブル中...');
      
      const arch = (window.architecture === 'HC4E') ? 'HC4E' : 'HC4';
      const result = await window.electronAPI.exportAssembledBinary(code, arch);
      
      if (result.success) {
        addOutputMessage(`バイナリファイルが生成されました: ${result.filePath}`);
        // upload と同一形式でログを表示
        if (Array.isArray(result.logs)) {
          result.logs.forEach(line => addOutputMessage(line));
        } else if (result.output) {
          addOutputMessage('Assembler stdout:');
          addOutputMessage(result.output.trim());
        }
        alert('バイナリファイルが生成されました: ' + result.filePath);
      } else if (result.canceled) {
        addOutputMessage('バイナリエクスポートがキャンセルされました');
      } else {
        addOutputMessage(`バイナリの生成に失敗しました: ${result.error}`, 'error');
        alert('バイナリの生成に失敗しました:\n' + result.error);
      }
    } catch (error) {
      addOutputMessage(`バイナリエクスポート中にエラーが発生しました: ${error.message}`, 'error');
      alert('バイナリエクスポート中にエラーが発生しました: ' + error.message);
    }
  } else {
    // ブラウザ環境では利用不可
    alert('バイナリエクスポート機能はElectronアプリでのみ利用できます。');
  }
}

// ブロック保存機能
async function saveBlocksFile(saveAs = false) {
  if (!window.vasmWorkspace) {
    alert('ワークスペースが初期化されていません。');
    return;
  }
  
  // Blocklyワークスペースの状態をXMLとして保存
  const xml = Blockly.serialization.workspaces.save(window.vasmWorkspace);
  const xmlText = JSON.stringify(xml);
  
  try {
    const filePath = saveAs ? null : currentFilePath;
    const result = await window.electronAPI.saveBlocksFile(xmlText, filePath);
    
    if (result.success) {
      currentFilePath = result.filePath;
      addOutputMessage(`ブロックファイルが保存されました: ${result.filePath}`);
    } else if (result.canceled) {
      addOutputMessage('ブロックファイルの保存がキャンセルされました');
    } else {
      addOutputMessage(`ブロックファイルの保存に失敗しました: ${result.error}`, 'error');
      alert('ブロックファイルの保存に失敗しました: ' + result.error);
    }
  } catch (error) {
    alert('ブロック保存中にエラーが発生しました: ' + error.message);
  }
}

// ブロック読み込み機能
function loadBlocksFile(content) {
  if (!window.vasmWorkspace) {
    alert('ワークスペースが初期化されていません。');
    return;
  }
  
  try {
    // 既存のブロックをクリア
    window.vasmWorkspace.clear();
    
    // JSONからワークスペースを復元
    const data = JSON.parse(content);
    Blockly.serialization.workspaces.load(data, window.vasmWorkspace);
    
    addOutputMessage('ブロックファイルが読み込まれました');
    console.log('[INFO] ブロックファイルが読み込まれました');
  } catch (error) {
    addOutputMessage(`ブロックファイルの読み込みに失敗しました: ${error.message}`, 'error');
    alert('ブロックファイルの読み込みに失敗しました: ' + error.message);
  }
}

// 新しいワークスペース作成
function newWorkspace() {
  if (!window.vasmWorkspace) {
    alert('ワークスペースが初期化されていません。');
    return;
  }
  
  if (confirm('現在の作業内容が失われます。新しいワークスペースを作成しますか？')) {
    window.vasmWorkspace.clear();
    currentFilePath = null;
    clearOutputMessages(); // 出力メッセージもクリア
    addOutputMessage('新しいワークスペースが作成されました');
    console.log('[INFO] 新しいワークスペースが作成されました');
  }
}

// ラベル作成ダイアログの制御
function confirmLabelCreation() {
  var input = document.getElementById('labelInput');
  var newLabel = input.value;
  var dialog = document.getElementById('labelDialog');
  
  if (window.currentLabelBlock && newLabel && newLabel.trim()) {
    window.currentLabelBlock.handleNewLabel(newLabel.trim());
  } else if (window.currentLabelBlock) {
    // 空の場合は最初のラベルに戻す
    var field = window.currentLabelBlock.getField('LABEL');
    if (field && window.customLabels && window.customLabels.length > 0) {
      field.setValue(window.customLabels[0]);
    }
  }
  
  dialog.style.display = 'none';
  window.currentLabelBlock = null;
}

function cancelLabelCreation() {
  var dialog = document.getElementById('labelDialog');
  
  if (window.currentLabelBlock) {
    // キャンセルの場合は最初のラベルに戻す
    var field = window.currentLabelBlock.getField('LABEL');
    if (field && window.customLabels && window.customLabels.length > 0) {
      field.setValue(window.customLabels[0]);
    }
  }
  
  dialog.style.display = 'none';
  window.currentLabelBlock = null;
}

// 重複リスナー登録防止フラグ
let eventListenersInitialized = false;

// イベントリスナーの初期化
function initializeEventListeners() {
  if (eventListenersInitialized) return;

  // Enterキーでの確定（1回のみ）
  document.addEventListener('DOMContentLoaded', function() {
    const input = document.getElementById('labelInput');
    if (input) {
      input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          confirmLabelCreation();
        } else if (e.key === 'Escape') {
          cancelLabelCreation();
        }
      });
    }
  }, { once: true });

  // メニューアクションリスナー（Electronのメニューからの操作）を1回だけ登録
  if (typeof window.electronAPI !== 'undefined') {
    window.electronAPI.onMenuAction((event, action, data) => {
      handleMenuAction(action, data);
    });
  }

  eventListenersInitialized = true;
}

// メニューアクションハンドラ
function handleMenuAction(action, data) {
  switch (action) {
    case 'new':
      newWorkspace();
      break;
    case 'open':
      if (data && data.content) {
        loadBlocksFile(data.content);
        currentFilePath = data.filePath;
        addOutputMessage(`ブロックファイルを開きました: ${data.filePath}`);
      }
      break;
    case 'save':
      saveBlocksFile(false);
      break;
    case 'save-as':
      saveBlocksFile(true);
      break;
    case 'export-assembly':
      saveAssemblyFile();
      break;
    case 'export-binary':
      exportAssembledBinary();
      break;
    case 'upload':
      uploadToDevice();
      break;
    default:
      console.log('Unknown menu action:', action);
  }
}

// アプリケーション全体の初期化
function initializeApp() {
  // DOMの準備ができるまで少し待つ
  setTimeout(function() {
    // Blocklyワークスペースを初期化
    window.vasmWorkspace = initializeWorkspace();
    console.log('[INFO] Visual Assembler initialized successfully');
    // レジスタ初期表示（必要なら自動取得も可能だが、明示ボタン優先）
  }, 50);
  
  // イベントリスナーを初期化
  initializeEventListeners();
}

// DOMContentLoadedイベントでアプリケーションを初期化
document.addEventListener('DOMContentLoaded', function() {
  initializeApp();
});

// デバイスへアップロード
async function uploadToDevice() {
  if (!window.vasmWorkspace) {
    alert('ワークスペースが初期化されていません。');
    return;
  }
  // 現在のアセンブリ生成（表示と同一ロジック）
  const code = (typeof window.getAssemblyCode === 'function') ? window.getAssemblyCode() : Blockly.Assembly.workspaceToCode(window.vasmWorkspace);
  if (!code || code.trim() === '') {
    alert('アップロードするアセンブリコードがありません。');
    return;
  }
  const arch = (window.architecture === 'HC4E') ? 'HC4E' : 'HC4';
  try {
    addOutputMessage('アップロードを開始します...');
    const res = await window.electronAPI.uploadToDevice(code, arch);
    // 実行したコマンドとプロセス出力を表示
    if (res.logs && Array.isArray(res.logs)) {
      res.logs.forEach(line => addOutputMessage(line));
    }
    if (res.success) {
      addOutputMessage('アップロード完了');
      if (res.output) addOutputMessage(res.output.trim());
      alert('アップロードが完了しました');
    } else {
      addOutputMessage('アップロード失敗: ' + res.error, 'error');
      alert('アップロードに失敗しました:\n' + res.error);
    }
  } catch (e) {
    addOutputMessage('アップロード中にエラー: ' + e.message, 'error');
    alert('アップロード中にエラーが発生しました: ' + e.message);
  }
}

function renderRegisterData(data) {
  const statusEl = document.getElementById('registerStatus');
  const outEl = document.getElementById('registerOutput');
  if (!data) {
    if (statusEl) statusEl.textContent = 'データなし';
    if (outEl) outEl.textContent = '';
    return;
  }

  // 期待JSON: { regs: [...], pc: <num>, inst: <num> }
  const regs = Array.isArray(data?.regs) ? data.regs : [];
  const pc = data?.pc;
  const inst = data?.inst;

  // テーブル風整形表示
  const maxRegs = 16;
  const labels = [];
  const values = [];
  for (let i = 0; i < maxRegs; i++) {
    labels.push(`R${i}`);
    const v = typeof regs[i] !== 'undefined' ? regs[i] : '';
    values.push(String(v));
  }
  const headerLine = labels.join('\t');
  const valueLine = values.join('\t');

  const pcPart = (typeof pc !== 'undefined') ? `PC: ${pc}` : '';
  const instPart = (typeof inst !== 'undefined') ? `INST: ${inst.toString(16).toUpperCase().padStart(2, '0')}` : '';
  const thirdLine = [pcPart, instPart].filter(Boolean).join('    ');

  const lines = [headerLine, valueLine];
  if (thirdLine) lines.push(thirdLine);

  if (outEl) outEl.textContent = lines.join('\n');
  if (statusEl) statusEl.textContent = '取得成功';
}

// レジスタ取得（1回）
async function fetchRegisters() {
  const statusEl = document.getElementById('registerStatus');
  const outEl = document.getElementById('registerOutput');
  if (statusEl) statusEl.textContent = '取得中…';
  if (outEl) outEl.textContent = '';

  if (typeof window.electronAPI === 'undefined') {
    if (statusEl) statusEl.textContent = 'Electron環境でのみ利用できます';
    return;
  }
  try {
    const res = await window.electronAPI.fetchRegisters();
    if (!res.success) {
      if (statusEl) statusEl.textContent = '取得失敗';
      if (outEl) outEl.textContent = res.error || '不明なエラー';
      return;
    }
    renderRegisterData(res.data);
  } catch (e) {
    if (statusEl) statusEl.textContent = '取得失敗';
    if (outEl) outEl.textContent = e.message;
  }
}

// トレース制御
let isTracing = false;
let traceListenersInitialized = false;

function ensureTraceListeners() {
  if (traceListenersInitialized || typeof window.electronAPI === 'undefined') return;
  window.electronAPI.onTraceUpdate((data) => {
    renderRegisterData(data);
  });
  window.electronAPI.onTraceError((msg) => {
    const statusEl = document.getElementById('registerStatus');
    if (statusEl) statusEl.textContent = 'トレースエラー';
    const outEl = document.getElementById('registerOutput');
    if (outEl && msg) {
      outEl.textContent = (outEl.textContent ? outEl.textContent + '\n' : '') + msg;
    }
  });
  window.electronAPI.onTraceStopped((info) => {
    isTracing = false;
    const btn = document.getElementById('traceButton');
    if (btn) btn.textContent = 'トレース';
    const statusEl = document.getElementById('registerStatus');
    if (statusEl) statusEl.textContent = '停止';
  });
  traceListenersInitialized = true;
}

async function toggleTrace() {
  if (typeof window.electronAPI === 'undefined') {
    alert('トレース機能はElectronアプリでのみ利用できます。');
    return;
  }
  ensureTraceListeners();

  const btn = document.getElementById('traceButton');
  const statusEl = document.getElementById('registerStatus');

  if (!isTracing) {
    // 開始
    if (statusEl) statusEl.textContent = 'トレース開始中…';
    const res = await window.electronAPI.startTrace();
    if (!res.success) {
      if (statusEl) statusEl.textContent = 'トレース開始失敗';
      alert('トレース開始に失敗しました:\n' + (res.error || '不明なエラー'));
      return;
    }
    isTracing = true;
    if (btn) btn.textContent = '停止';
    if (statusEl) statusEl.textContent = 'トレース中';
  } else {
    // 停止
    const res = await window.electronAPI.stopTrace();
    if (!res.success) {
      alert('トレース停止に失敗しました:\n' + (res.error || '不明なエラー'));
      return;
    }
    isTracing = false;
    if (btn) btn.textContent = 'トレース';
    if (statusEl) statusEl.textContent = '停止';
  }
}
