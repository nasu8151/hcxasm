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
        alert('ファイルが保存されました: ' + result.filePath);
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
        if (result.output) {
          addOutputMessage('hcxasm.py の出力:');
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
      alert('ブロックファイルが保存されました: ' + result.filePath);
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
