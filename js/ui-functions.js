/**
 * HCx Series Visual Assembler - UI Functions
 * ビジュアルアセンブラのUI関連機能
 */

// 現在のファイルパス（Save機能用）
let currentFilePath = null;
let isWorkspaceDirty = false;

function setWorkspaceDirty(isDirty) {
  isWorkspaceDirty = !!isDirty;
  if (typeof window.electronAPI !== 'undefined' && window.electronAPI.setWorkspaceDirty) {
    window.electronAPI.setWorkspaceDirty(isWorkspaceDirty);
  }
}

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
  const workspaceData = Blockly.serialization.workspaces.save(window.vasmWorkspace);
  const payload = {
    version: 2,
    workspace: workspaceData,
    customLabels: Array.isArray(window.customLabels) ? window.customLabels : []
  };
  const xmlText = JSON.stringify(payload);
  
  try {
    const filePath = saveAs ? null : currentFilePath;
    const result = await window.electronAPI.saveBlocksFile(xmlText, filePath);
    
    if (result.success) {
      currentFilePath = result.filePath;
      addOutputMessage(`ブロックファイルが保存されました: ${result.filePath}`);
      setWorkspaceDirty(false);
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
    const workspaceData = (data && data.workspace) ? data.workspace : data;
    const customLabels = Array.isArray(data?.customLabels)
      ? data.customLabels
      : extractLabelsFromWorkspaceData(workspaceData);
    window.customLabels = normalizeLabelList(customLabels);

    Blockly.serialization.workspaces.load(workspaceData, window.vasmWorkspace);
    refreshLabelDropdowns(window.vasmWorkspace);
    setWorkspaceDirty(false);
    
    addOutputMessage('ブロックファイルが読み込まれました');
    console.log('[INFO] ブロックファイルが読み込まれました');
  } catch (error) {
    addOutputMessage(`ブロックファイルの読み込みに失敗しました: ${error.message}`, 'error');
    alert('ブロックファイルの読み込みに失敗しました: ' + error.message);
  }
}

function normalizeLabelList(labels) {
  const base = Array.isArray(labels) ? labels : [];
  const result = [];
  const seen = new Set();
  base.forEach((label) => {
    if (typeof label !== 'string') return;
    const trimmed = label.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  });
  if (!result.includes('START')) {
    result.unshift('START');
  }
  return result;
}

function extractLabelsFromWorkspaceData(workspaceData) {
  const labels = [];
  const seen = new Set();

  function addLabel(value) {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    labels.push(trimmed);
  }

  function visitBlock(block) {
    if (!block || typeof block !== 'object') return;
    if (block.fields && typeof block.fields === 'object') {
      addLabel(block.fields.LABEL);
    }
    if (block.inputs && typeof block.inputs === 'object') {
      Object.values(block.inputs).forEach((input) => {
        if (input && input.block) {
          visitBlock(input.block);
        }
      });
    }
    if (block.next && block.next.block) {
      visitBlock(block.next.block);
    }
  }

  if (workspaceData && workspaceData.blocks && Array.isArray(workspaceData.blocks.blocks)) {
    workspaceData.blocks.blocks.forEach(visitBlock);
  } else if (workspaceData && workspaceData.blocks) {
    visitBlock(workspaceData.blocks);
  }

  return labels;
}

function refreshLabelDropdowns(workspace) {
  if (!workspace || typeof workspace.getAllBlocks !== 'function') return;
  const blocks = workspace.getAllBlocks();
  blocks.forEach((block) => {
    if (typeof block.getLabelOptions !== 'function') return;
    const field = block.getField && block.getField('LABEL');
    if (!field) return;
    const current = field.getValue();
    field.menuGenerator_ = block.getLabelOptions.bind(block);
    if (current && current !== 'CREATE_NEW') {
      field.setValue(current);
    } else if (Array.isArray(window.customLabels) && window.customLabels.length > 0) {
      field.setValue(window.customLabels[0]);
    }
  });
}

// 新しいワークスペース作成
function newWorkspace() {
  if (!window.vasmWorkspace) {
    alert('ワークスペースが初期化されていません。');
    return;
  }

  // ネイティブ confirm() を使うと OS レベルのキーボードフォーカスが失われ、
  // その後 FieldNumber に数値入力できなくなるため、カスタム HTML ダイアログを使用する。
  const dlg = document.getElementById('newWorkspaceDialog');
  if (dlg) {
    dlg.style.display = 'block';
  }
}

function confirmNewWorkspace() {
  const dlg = document.getElementById('newWorkspaceDialog');
  if (dlg) dlg.style.display = 'none';

  if (!window.vasmWorkspace) return;
  window.vasmWorkspace.clear();
  currentFilePath = null;
  clearOutputMessages();
  setWorkspaceDirty(false);
  addOutputMessage('新しいワークスペースが作成されました');
  console.log('[INFO] 新しいワークスペースが作成されました');
}

function cancelNewWorkspace() {
  const dlg = document.getElementById('newWorkspaceDialog');
  if (dlg) dlg.style.display = 'none';
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
let labelInputListenerInitialized = false;

function initializeLabelInputListener() {
  if (labelInputListenerInitialized) return;
  const input = document.getElementById('labelInput');
  if (!input) return;

  input.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      confirmLabelCreation();
    } else if (e.key === 'Escape') {
      cancelLabelCreation();
    }
  });

  labelInputListenerInitialized = true;
}

// イベントリスナーの初期化
function initializeEventListeners() {
  if (eventListenersInitialized) return;

  // Enterキーでの確定（動的ロード時にも対応）
  initializeLabelInputListener();

  // メニューアクションリスナー（Electronのメニューからの操作）を1回だけ登録
  if (typeof window.electronAPI !== 'undefined') {
    window.electronAPI.onMenuAction((event, action, data) => {
      handleMenuAction(action, data);
    });
    if (window.electronAPI.onArchitectureChanged) {
      window.electronAPI.onArchitectureChanged((arch) => {
        if (!arch || window.architecture === arch) return;
        window.architecture = arch;
        if (typeof initializeApp === 'function') {
          initializeApp();
        }
      });
    }
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
    setWorkspaceDirty(false);
    // レジスタ初期表示（必要なら自動取得も可能だが、明示ボタン優先）
    initFlyoutResizer(window.vasmWorkspace);
  }, 50);
  
  // イベントリスナーを初期化
  initializeEventListeners();
}

function bootstrapApp() {
  initializeApp();
  initSplitters();
}

// 動的ロード時はDOMContentLoadedが既に発火済みのため、readyStateで分岐
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp, { once: true });
} else {
  bootstrapApp();
}

// スプリッター初期化（ツールボックス、出力タブのリサイズ）
function initSplitters() {
  const outputContainer = document.getElementById('outputContainer');
  const outputSplitter = document.getElementById('outputSplitter');
  let isResizingOutput = false;

  if (outputSplitter && outputContainer) {
    outputSplitter.addEventListener('mousedown', (e) => {
      isResizingOutput = true;
      document.body.style.cursor = 'row-resize';
      e.preventDefault();
    });
  }

  window.addEventListener('mousemove', (e) => {
    if (isResizingOutput) {
      // bottom height = window.innerHeight - e.clientY
      const newHeight = Math.max(50, Math.min(window.innerHeight - e.clientY, window.innerHeight - 100));
      outputContainer.style.height = newHeight + 'px';
      if (window.vasmWorkspace) {
        Blockly.svgResize(window.vasmWorkspace);
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (isResizingOutput) {
      isResizingOutput = false;
      document.body.style.cursor = 'default';
      if (window.vasmWorkspace) {
        Blockly.svgResize(window.vasmWorkspace);
      }
    }
  });
}

function initFlyoutResizer(workspace) {
  if (!workspace) return;
  const flyout = workspace.getFlyout();
  if (!flyout) return;

  const blocklyDiv = document.getElementById('blocklyDiv');
  if (!blocklyDiv) return;

  // すでに存在していれば削除
  let resizer = document.getElementById('flyoutSplitter');
  if (resizer) resizer.remove();

  resizer = document.createElement('div');
  resizer.id = 'flyoutSplitter';
  resizer.className = 'vertical-resizer';
  resizer.style.position = 'absolute';
  resizer.style.top = '0';
  resizer.style.bottom = '0';
  resizer.style.zIndex = '50';
  
  blocklyDiv.appendChild(resizer);

  let customWidth = null;

  // Flyoutの幅を返すメソッドをフック
  if (typeof flyout.getWidth === 'function') {
    const originalGetWidth = flyout.getWidth.bind(flyout);
    flyout.getWidth = function() {
      if (customWidth !== null) {
        return customWidth;
      }
      return originalGetWidth();
    };
  }

  const originalReflow = flyout.reflowInternal_ ? flyout.reflowInternal_.bind(flyout) : (flyout.reflow ? flyout.reflow.bind(flyout) : null);
  if (originalReflow) {
    const hook = function() {
      originalReflow();
      if (customWidth !== null) {
        flyout.width_ = customWidth;
        if (flyout.svgBackground_) flyout.svgBackground_.setAttribute('width', customWidth);
        if (flyout.svgGroup_) flyout.svgGroup_.setAttribute('width', customWidth);
      }
    };
    if (flyout.reflowInternal_) {
      flyout.reflowInternal_ = hook;
    } else {
      flyout.reflow = hook;
    }
  }

  function updateResizerPosition() {
    if (!resizer.parentNode) return;
    const actualWidth = typeof flyout.getWidth === 'function' ? flyout.getWidth() : (flyout.width_ || 0);
    resizer.style.left = actualWidth + 'px';
  }

  workspace.addChangeListener(() => {
    updateResizerPosition();
  });

  let isResizing = false;
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  // ドラッグ中に選択が起きるのを防ぐ
  window.addEventListener('selectstart', (e) => {
    if (isResizing) {
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const rect = blocklyDiv.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    
    // 最低でも100px、最大でBlocklyDivの幅-50
    const minWidth = 100;
    customWidth = Math.max(minWidth, Math.min(offsetX, rect.width - 50));
    
    if (originalReflow) {
      if (flyout.reflowInternal_) flyout.reflowInternal_();
      else if (flyout.reflow) flyout.reflow();
    }
    Blockly.svgResize(workspace);
    updateResizerPosition();
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = 'default';
      Blockly.svgResize(workspace);
      updateResizerPosition();
    }
  });

  setTimeout(() => {
    if (originalReflow) {
      if (flyout.reflowInternal_) flyout.reflowInternal_();
      else if (flyout.reflow) flyout.reflow();
    }
    updateResizerPosition();
  }, 150);
}

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
