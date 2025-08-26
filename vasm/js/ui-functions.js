/**
 * HCx Series Visual Assembler - UI Functions
 * ビジュアルアセンブラのUI関連機能
 */

// アセンブリファイル保存機能
async function saveAssemblyFile() {
  if (!window.vasmWorkspace) {
    alert('ワークスペースが初期化されていません。');
    return;
  }
  
  const code = Blockly.Assembly.workspaceToCode(window.vasmWorkspace);
  
  if (!code || code.trim() === '') {
    alert('保存するアセンブリコードがありません。ブロックを配置してください。');
    return;
  }

  // Electronが利用可能かチェック
  if (typeof window.electronAPI !== 'undefined') {
    try {
      const result = await window.electronAPI.saveAssemblyFile(code);
      if (result.success) {
        alert('ファイルが保存されました: ' + result.filePath);
      } else if (result.canceled) {
        // ユーザーがキャンセルした場合は何もしない
      } else {
        alert('ファイルの保存に失敗しました: ' + result.error);
      }
    } catch (error) {
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

// イベントリスナーの初期化
function initializeEventListeners() {
  // Enterキーでの確定
  document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('labelInput').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        confirmLabelCreation();
      } else if (e.key === 'Escape') {
        cancelLabelCreation();
      }
    });
  });
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
