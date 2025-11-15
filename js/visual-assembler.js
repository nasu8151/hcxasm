/**
 * HCx Series Visual Assembler
 * ビジュアルアセンブラ本体コード
 */

// --- 独自ブロック定義 ---
// --- DICTHC4命令すべてのブロック定義 ---

// 汎用: 引数なし
function makeNoArgBlock(type, label, color) {
  Blockly.Blocks[type] = {
    init: function() {
      this.appendDummyInput().appendField(label);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(color);
    }
  };
}

// 汎用: 即値
function makeImmBlock(type, label, color) {
  Blockly.Blocks[type] = {
    init: function() {
      this.appendDummyInput()
          .appendField(label + ' #')
          .appendField(new Blockly.FieldNumber(0, 0, 255), "VALUE");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(color);
    }
  };
}

// 汎用: フラグ
function makeFlagBlock(type, label, color) {
  Blockly.Blocks[type] = {
    init: function() {
      this.appendDummyInput()
          .appendField(label)
          .appendField(new Blockly.FieldDropdown([
            [" ", " "],
            ["C", "C"],
            ["NC", "NC"],
            ["Z", "Z"],
            ["NZ", "NZ"]
          ]), "FLAG");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(color);
    }
  };
}

function makeRegisterBlock(type, label, color) {
  Blockly.Blocks[type] = {
    init: function() {
      this.appendDummyInput()
          .appendField(label)
          .appendField(new Blockly.FieldDropdown([
            ["R0", "R0"],
            ["R1", "R1"],
            ["R2", "R2"],
            ["R3", "R3"],
            ["R4", "R4"],
            ["R5", "R5"],
            ["R6", "R6"],
            ["R7", "R7"],
            ["R8", "R8"],
            ["R9", "R9"],
            ["R10", "R10"],
            ["R11", "R11"],
            ["R12", "R12"],
            ["R13", "R13"],
            ["R14", "R14"],
            ["R15", "R15"]
            ]), "REGISTER");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(color);
    }
  };
}

function makeGotoBlock(type, label, color) {
  Blockly.Blocks[type] = {
    init: function() {
      this.appendDummyInput()
          .appendField(label)
          .appendField(new Blockly.FieldDropdown(this.getLabelOptions.bind(this)), "LABEL");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(color);
    },
    
    getLabelOptions: function() {
      console.log('[DEBUG] getLabelOptions called');
      // 既存のラベルオプションを取得
      var options = [];
      
      // デフォルトのラベル
      if (window.customLabels && window.customLabels.length > 0) {
        window.customLabels.forEach(function(label) {
          options.push([label, label]);
        });
        console.log('[DEBUG] customLabels found:', window.customLabels);
      } else {
        options.push(['START', 'START']);
        console.log('[DEBUG] using default START label');
      }
      
      // 「新しいラベルを作成」オプションを追加
      options.push(['新しいラベルを作成...', 'CREATE_NEW']);
      console.log('[DEBUG] final options:', options);
      
      return options;
    },
    
    onchange: function(event) {
      console.log('[DEBUG] onchange event triggered:', event);
      if (event.type === Blockly.Events.BLOCK_CHANGE && 
          event.blockId === this.id && 
          event.element === 'field' && 
          event.name === 'LABEL') {
        
        console.log('[DEBUG] LABEL field change detected, newValue:', event.newValue);
        if (event.newValue === 'CREATE_NEW') {
          console.log('[DEBUG] CREATE_NEW selected, creating new label...');
          // 新しいラベル作成処理
          setTimeout(() => {
            this.createNewLabel();
          }, 10);
        }
      }
    },
    
    createNewLabel: function() {
      console.log('[DEBUG] createNewLabel called');
      
      // 現在のブロックインスタンスを保存
      window.currentLabelBlock = this;
      
      // ダイアログを表示
      var dialog = document.getElementById('labelDialog');
      var input = document.getElementById('labelInput');
      input.value = 'LABEL' + (Date.now() % 1000);
      dialog.style.display = 'block';
      input.focus();
      input.select();
    },
    
    handleNewLabel: function(newLabel) {
      if (newLabel && newLabel.trim) {
        newLabel = newLabel.trim().toUpperCase();
        console.log('[DEBUG] processed label:', newLabel);
        
        // カスタムラベルリストを初期化（存在しない場合）
        if (!window.customLabels) {
          window.customLabels = ['START'];
          console.log('[DEBUG] initialized customLabels');
        }
        
        // 重複チェック
        if (window.customLabels.indexOf(newLabel) === -1) {
          window.customLabels.push(newLabel);
          console.log('[DEBUG] added new label, customLabels now:', window.customLabels);
        } else {
          console.log('[DEBUG] label already exists');
        }
        
        // すべてのJPブロックのドロップダウンを更新
        this.updateAllLabelBlocks();
        
        // 現在のブロックの値を新しいラベルに設定
        var field = this.getField('LABEL');
        if (field) {
          // メニューを再生成してから値を設定
          field.menuGenerator_ = this.getLabelOptions.bind(this);
          field.setValue(newLabel);
          console.log('[DEBUG] field value set to:', newLabel);
        }
      } else {
        console.log('[DEBUG] user cancelled or empty input');
        // キャンセルまたは空の場合、最初のラベルに戻す
        var field = this.getField('LABEL');
        if (field && window.customLabels && window.customLabels.length > 0) {
          field.setValue(window.customLabels[0]);
          console.log('[DEBUG] reset to first label:', window.customLabels[0]);
        }
      }
    },
    
    updateAllLabelBlocks: function() {
      console.log('[DEBUG] updateAllLabelBlocks called');
      // ワークスペース内のすべてのラベルブロックを更新
      var workspace = this.workspace;
      var allBlocks = workspace.getAllBlocks();
      var self = this;
      console.log('[DEBUG] found', allBlocks.length, 'blocks in workspace');
      
      allBlocks.forEach(function(block) {
        if (block.type === self.type && block !== self) {
          console.log('[DEBUG] updating block:', block.id);
          var field = block.getField('LABEL');
          if (field) {
            // メニューを強制的に再生成
            field.menuGenerator_ = block.getLabelOptions.bind(block);
            console.log('[DEBUG] updated menuGenerator for block:', block.id);
          }
        }
      });
    }
  };
}

function makeConditionalGotoBlock(type, label, color) {
  Blockly.Blocks[type] = {
    init: function() {
      this.appendDummyInput()
          .appendField(label)
          .appendField(new Blockly.FieldDropdown([
            ["C", "C"],
            ["NC", "NC"],
            ["Z", "Z"],
            ["NZ", "NZ"]
          ]), "FLAG")
          .appendField(new Blockly.FieldDropdown(this.getLabelOptions.bind(this)), "LABEL");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(color);
    },
    
    getLabelOptions: function() {
      console.log('[DEBUG] conditional goto getLabelOptions called');
      // 既存のラベルオプションを取得
      var options = [];
      
      // デフォルトのラベル
      if (window.customLabels && window.customLabels.length > 0) {
        window.customLabels.forEach(function(label) {
          options.push([label, label]);
        });
        console.log('[DEBUG] customLabels found:', window.customLabels);
      } else {
        options.push(['START', 'START']);
        console.log('[DEBUG] using default START label');
      }
      
      // 「新しいラベルを作成」オプションを追加
      options.push(['新しいラベルを作成...', 'CREATE_NEW']);
      console.log('[DEBUG] final options:', options);
      
      return options;
    },
    
    onchange: function(event) {
      console.log('[DEBUG] conditional goto onchange event triggered:', event);
      if (event.type === Blockly.Events.BLOCK_CHANGE && 
          event.blockId === this.id && 
          event.element === 'field' && 
          event.name === 'LABEL') {
        
        console.log('[DEBUG] LABEL field change detected, newValue:', event.newValue);
        if (event.newValue === 'CREATE_NEW') {
          console.log('[DEBUG] CREATE_NEW selected, creating new label...');
          // 新しいラベル作成処理
          setTimeout(() => {
            this.createNewLabel();
          }, 10);
        }
      }
    },
    
    createNewLabel: function() {
      console.log('[DEBUG] createNewLabel called for conditional goto');
      
      // 現在のブロックインスタンスを保存
      window.currentLabelBlock = this;
      
      // ダイアログを表示
      var dialog = document.getElementById('labelDialog');
      var input = document.getElementById('labelInput');
      input.value = 'LABEL' + (Date.now() % 1000);
      dialog.style.display = 'block';
      input.focus();
      input.select();
    },
    
    handleNewLabel: function(newLabel) {
      if (newLabel && newLabel.trim) {
        newLabel = newLabel.trim().toUpperCase();
        console.log('[DEBUG] processed label:', newLabel);
        
        // カスタムラベルリストを初期化（存在しない場合）
        if (!window.customLabels) {
          window.customLabels = ['START'];
          console.log('[DEBUG] initialized customLabels');
        }
        
        // 重複チェック
        if (window.customLabels.indexOf(newLabel) === -1) {
          window.customLabels.push(newLabel);
          console.log('[DEBUG] added new label, customLabels now:', window.customLabels);
        } else {
          console.log('[DEBUG] label already exists');
        }
        
        // すべてのラベル関連ブロックのドロップダウンを更新
        this.updateAllLabelBlocks();
        
        // 現在のブロックの値を新しいラベルに設定
        var field = this.getField('LABEL');
        if (field) {
          // メニューを再生成してから値を設定
          field.menuGenerator_ = this.getLabelOptions.bind(this);
          field.setValue(newLabel);
          console.log('[DEBUG] field value set to:', newLabel);
        }
      } else {
        console.log('[DEBUG] user cancelled or empty input');
        // キャンセルまたは空の場合、最初のラベルに戻す
        var field = this.getField('LABEL');
        if (field && window.customLabels && window.customLabels.length > 0) {
          field.setValue(window.customLabels[0]);
          console.log('[DEBUG] reset to first label:', window.customLabels[0]);
        }
      }
    },
    
    updateAllLabelBlocks: function() {
      console.log('[DEBUG] updateAllLabelBlocks called from conditional goto');
      // ワークスペース内のすべてのラベル関連ブロックを更新
      var workspace = this.workspace;
      var allBlocks = workspace.getAllBlocks();
      var self = this;
      console.log('[DEBUG] found', allBlocks.length, 'blocks in workspace');
      
      allBlocks.forEach(function(block) {
        // ラベル関連ブロックを更新
        if ((block.type === 'goto' || block.type === 'goto_if' || block.type === 'label_def') && block !== self) {
          console.log('[DEBUG] updating block:', block.id);
          var field = block.getField('LABEL');
          if (field) {
            // メニューを強制的に再生成
            field.menuGenerator_ = block.getLabelOptions.bind(block);
            console.log('[DEBUG] updated menuGenerator for block:', block.id);
          }
        }
      });
    }
  };
}

// 汎用: ハットブロック版ラベル定義（Scratchのイベントブロック風）
function makeLabelHatBlock(type, label, color) {
  Blockly.Blocks[type] = {
    init: function() {
      this.appendDummyInput()
          .appendField(label)
          .appendField(new Blockly.FieldDropdown(this.getLabelOptions.bind(this)), "LABEL");
      this.setNextStatement(true, null);
      this.setColour(color);
      this.setTooltip("ラベルを定義し、このブロックから始まるプログラムを実行します");
      
      // ハットブロックの特徴的な形状にする
      this.hat = 'cap';
    },
    
    getLabelOptions: function() {
      // 既存のラベルオプションを取得
      var options = [];
      
      // デフォルトのラベル
      if (window.customLabels && window.customLabels.length > 0) {
        for (var i = 0; i < window.customLabels.length; i++) {
          options.push([window.customLabels[i], window.customLabels[i]]);
        }
      } else {
        options.push(['START', 'START']);
      }
      
      // 「新しいラベルを作成」オプションを追加
      options.push(['新しいラベルを作成...', 'CREATE_NEW']);
      console.log('[DEBUG] hat block final options:', options);
      
      return options;
    },
    
    onchange: function(event) {
      console.log('[DEBUG] hat block onchange event triggered:', event);
      if (event.type === Blockly.Events.BLOCK_CHANGE && 
          event.blockId === this.id && 
          event.element === 'field' && 
          event.name === 'LABEL') {
        var newValue = event.newValue;
        console.log('[DEBUG] hat block label changed to:', newValue);
        if (newValue === 'CREATE_NEW') {
          this.createNewLabel();
        }
      }
    },
    
    createNewLabel: function() {
      console.log('[DEBUG] createNewLabel called for hat block');
      
      // 現在のブロックインスタンスを保存
      window.currentLabelBlock = this;
      
      // ダイアログを表示
      var dialog = document.getElementById('labelDialog');
      var input = document.getElementById('labelInput');
      input.value = 'LABEL' + (Date.now() % 1000);
      dialog.style.display = 'block';
      input.focus();
      input.select();
    },
    
    handleNewLabel: function(newLabel) {
      if (newLabel && newLabel.trim) {
        var trimmedLabel = newLabel.trim();
        console.log('[DEBUG] hat block handling new label:', trimmedLabel);
        
        // カスタムラベル一覧に追加
        if (!window.customLabels) {
          window.customLabels = [];
        }
        
        if (window.customLabels.indexOf(trimmedLabel) === -1) {
          window.customLabels.push(trimmedLabel);
          console.log('[DEBUG] added new label to list:', trimmedLabel);
          console.log('[DEBUG] current labels:', window.customLabels);
        }
        
        // このブロックの値を更新
        var field = this.getField('LABEL');
        if (field) {
          field.setValue(trimmedLabel);
          console.log('[DEBUG] hat block field value set to:', trimmedLabel);
        }
        
        // すべてのラベル関連ブロックを更新
        this.updateAllLabelBlocks();
        
        if (field) {
          console.log('[DEBUG] hat block field value set to:', newLabel);
        }
      } else {
        console.log('[DEBUG] user cancelled or empty input');
        // キャンセルまたは空の場合、最初のラベルに戻す
        var field = this.getField('LABEL');
        if (field && window.customLabels && window.customLabels.length > 0) {
          field.setValue(window.customLabels[0]);
          console.log('[DEBUG] reset to first label:', window.customLabels[0]);
        }
      }
    },
    
    updateAllLabelBlocks: function() {
      console.log('[DEBUG] updateAllLabelBlocks called from hat block');
      // ワークスペース内のすべてのラベル関連ブロックを更新
      var workspace = this.workspace;
      var allBlocks = workspace.getAllBlocks();
      var self = this;
      console.log('[DEBUG] found', allBlocks.length, 'blocks in workspace');
      
      allBlocks.forEach(function(block) {
        // ラベル定義ブロック、ハットブロック、GOTOブロックを更新
        if ((block.type === self.type || block.type === 'label_def' || block.type === 'jp' || block.type === 'goto' || block.type === 'goto_if') && block !== self) {
          console.log('[DEBUG] updating block:', block.id);
          var field = block.getField('LABEL');
          if (field) {
            // メニューを強制的に再生成
            field.menuGenerator_ = block.getLabelOptions.bind(block);
            console.log('[DEBUG] updated menuGenerator for block:', block.id);
          }
        }
      });
    }
  };
}

// 汎用: ラベルブロック（ラベルの定義用）
function makeLabelDefinitionBlock(type, label, color) {
  Blockly.Blocks[type] = {
    init: function() {
      this.appendDummyInput()
          .appendField(label)
          .appendField(new Blockly.FieldDropdown(this.getLabelOptions.bind(this)), "LABEL")
          .appendField(":");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(color);
    },
    
    getLabelOptions: function() {
      // 既存のラベルオプションを取得
      var options = [];
      
      // デフォルトのラベル
      if (window.customLabels && window.customLabels.length > 0) {
        window.customLabels.forEach(function(label) {
          options.push([label, label]);
        });
        console.log('[DEBUG] customLabels found:', window.customLabels);
      } else {
        options.push(['START', 'START']);
        console.log('[DEBUG] using default START label');
      }
      
      // 「新しいラベルを作成」オプションを追加
      options.push(['新しいラベルを作成...', 'CREATE_NEW']);
      console.log('[DEBUG] final options:', options);
      
      return options;
    },
    
    onchange: function(event) {
      console.log('[DEBUG] label definition onchange event triggered:', event);
      if (event.type === Blockly.Events.BLOCK_CHANGE && 
          event.blockId === this.id && 
          event.element === 'field' && 
          event.name === 'LABEL') {
        
        console.log('[DEBUG] LABEL field change detected, newValue:', event.newValue);
        if (event.newValue === 'CREATE_NEW') {
          console.log('[DEBUG] CREATE_NEW selected, creating new label...');
          // 新しいラベル作成処理
          setTimeout(() => {
            this.createNewLabel();
          }, 10);
        }
      }
    },
    
    createNewLabel: function() {
      console.log('[DEBUG] createNewLabel called for label definition');
      
      // 現在のブロックインスタンスを保存
      window.currentLabelBlock = this;
      
      // ダイアログを表示
      var dialog = document.getElementById('labelDialog');
      var input = document.getElementById('labelInput');
      input.value = 'LABEL' + (Date.now() % 1000);
      dialog.style.display = 'block';
      input.focus();
      input.select();
    },
    
    handleNewLabel: function(newLabel) {
      if (newLabel && newLabel.trim) {
        newLabel = newLabel.trim().toUpperCase();
        console.log('[DEBUG] processed label:', newLabel);
        
        // カスタムラベルリストを初期化（存在しない場合）
        if (!window.customLabels) {
          window.customLabels = ['START'];
          console.log('[DEBUG] initialized customLabels');
        }
        
        // 重複チェック
        if (window.customLabels.indexOf(newLabel) === -1) {
          window.customLabels.push(newLabel);
          console.log('[DEBUG] added new label, customLabels now:', window.customLabels);
        } else {
          console.log('[DEBUG] label already exists');
        }
        
        // すべてのラベル関連ブロックのドロップダウンを更新
        this.updateAllLabelBlocks();
        
        // 現在のブロックの値を新しいラベルに設定
        var field = this.getField('LABEL');
        if (field) {
          // メニューを再生成してから値を設定
          field.menuGenerator_ = this.getLabelOptions.bind(this);
          field.setValue(newLabel);
          console.log('[DEBUG] field value set to:', newLabel);
        }
      } else {
        console.log('[DEBUG] user cancelled or empty input');
        // キャンセルまたは空の場合、最初のラベルに戻す
        var field = this.getField('LABEL');
        if (field && window.customLabels && window.customLabels.length > 0) {
          field.setValue(window.customLabels[0]);
          console.log('[DEBUG] reset to first label:', window.customLabels[0]);
        }
      }
    },
    
    updateAllLabelBlocks: function() {
      console.log('[DEBUG] updateAllLabelBlocks called from label definition');
      // ワークスペース内のすべてのラベル関連ブロックを更新
      var workspace = this.workspace;
      var allBlocks = workspace.getAllBlocks();
      var self = this;
      console.log('[DEBUG] found', allBlocks.length, 'blocks in workspace');
      
      allBlocks.forEach(function(block) {
        // ラベル定義ブロックとGOTOブロック両方を更新
        if ((block.type === self.type || block.type === 'jp' || block.type === 'goto') && block !== self) {
          console.log('[DEBUG] updating block:', block.id);
          var field = block.getField('LABEL');
          if (field) {
            // メニューを強制的に再生成
            field.menuGenerator_ = block.getLabelOptions.bind(block);
            console.log('[DEBUG] updated menuGenerator for block:', block.id);
          }
        }
      });
    }
  };
}

// --- ブロック初期化関数 ---
function initializeBlocks() {
  // カスタムラベルを初期化
  window.customLabels = ['START', 'LOOP', 'END'];

  // 命令ごとにブロックを定義
  makeNoArgBlock('sm', 'SM', 60);
  makeRegisterBlock('sc', 'SC', 65);
  makeRegisterBlock('su', 'SU', 70);
  makeRegisterBlock('ad', 'AD', 75);
  makeRegisterBlock('xr', 'XR', 80);
  makeRegisterBlock('or', 'OR', 85);
  makeRegisterBlock('an', 'AN', 90);
  makeRegisterBlock('sa', 'SA', 95);
  makeNoArgBlock('lm', 'LM', 100);
  makeRegisterBlock('ld', 'LD', 105);
  makeImmBlock('li', 'LI', 110);
  makeFlagBlock('jp', 'JP', 120);
  makeNoArgBlock('np', 'NP', 125);

  // GOTO疑似命令
  makeGotoBlock('goto', 'GOTO', 130);
  
  // 条件付きGOTO疑似命令
  makeConditionalGotoBlock('goto_if', 'GOTO IF', 135);

  // ラベル定義ブロックを作成
  makeLabelDefinitionBlock('label_def', 'ラベル', 120);
  
  // ハットブロック版ラベル定義を作成
  makeLabelHatBlock('label_hat', 'プログラム開始', 120);
}

// --- コード生成ルール（独自アセンブリ出力） ---
function initializeCodeGenerator() {
  Blockly.Assembly = new Blockly.Generator('Assembly');
  Blockly.Assembly.PRECEDENCE = 0;
  Blockly.Assembly.forBlock = Blockly.Assembly.forBlock || {};
  
  Blockly.Assembly.forBlock['sc'] = function(block) {
    var reg = block.getFieldValue('REGISTER');
    return 'SC ' + reg + '\n';
  };
  
  Blockly.Assembly.forBlock['su'] = function(block) {
    var reg = block.getFieldValue('REGISTER');
    return 'SU ' + reg + '\n';
  };
  
  Blockly.Assembly.forBlock['ad'] = function(block) {
    var reg = block.getFieldValue('REGISTER');
    return 'AD ' + reg + '\n';
  };
  
  Blockly.Assembly.forBlock['xr'] = function(block) {
    var reg = block.getFieldValue('REGISTER');
    return 'XR ' + reg + '\n';
  };
  
  Blockly.Assembly.forBlock['or'] = function(block) {
    var reg = block.getFieldValue('REGISTER');
    return 'OR ' + reg + '\n';
  };
  
  Blockly.Assembly.forBlock['an'] = function(block) {
    var reg = block.getFieldValue('REGISTER');
    return 'AN ' + reg + '\n';
  };
  
  Blockly.Assembly.forBlock['sa'] = function(block) {
    var reg = block.getFieldValue('REGISTER');
    return 'SA ' + reg + '\n';
  };
  
  Blockly.Assembly.forBlock['ld'] = function(block) {
    var reg = block.getFieldValue('REGISTER');
    return 'LD ' + reg + '\n';
  };
  
  Blockly.Assembly.forBlock['lm'] = function(block) { return 'LM\n'; };
  
  Blockly.Assembly.forBlock['li'] = function(block) {
    var value = block.getFieldValue('VALUE');
    return 'LI #' + value + '\n';
  };
  
  Blockly.Assembly.forBlock['jp'] = function(block) {
    var flag = block.getFieldValue('FLAG');
    return 'JP ' + flag + '\n';
  };
  
  Blockly.Assembly.forBlock['sm'] = function(block) { return 'SM\n'; };
  Blockly.Assembly.forBlock['np'] = function(block) { return 'NP\n'; };

  // GOTO用コード生成ルール
  Blockly.Assembly.forBlock['goto'] = function(block) {
    var label = block.getFieldValue('LABEL');
    return  'LI #' + label + ':2\n' +
            'LI #' + label + ':1\n' +
            'LI #' + label + ':0\n' +
            'JP\n';
  };
  
  // 条件付きGOTO用コード生成ルール
  Blockly.Assembly.forBlock['goto_if'] = function(block) {
    var label = block.getFieldValue('LABEL');
    var flag = block.getFieldValue('FLAG');
    return  'LI #' + label + ':2\n' +
            'LI #' + label + ':1\n' +
            'LI #' + label + ':0\n' +
            'JP ' + flag + '\n';
  };
  
  // ラベル定義ブロック用のコード生成ルール
  Blockly.Assembly.forBlock['label_def'] = function(block) {
    var label = block.getFieldValue('LABEL');
    return label + ':\n';
  };
  
  // ハットブロック用のコード生成ルール
  Blockly.Assembly.forBlock['label_hat'] = function(block) {
    var label = block.getFieldValue('LABEL');
    return label + ':\n';
  };
  
  Blockly.Assembly.init = function(workspace) {};
  Blockly.Assembly.finish = function(code) { return code; };
  Blockly.Assembly.scrub_ = function(block, code) {
    // ハットブロック専用の処理なので、nextBlockは処理しない
    return code;
  };
}

// --- ツールボックス定義 ---
function getToolboxConfig() {
  return {
    "kind": "flyoutToolbox",
    "contents": [
      { "kind": "block", "type": "label_hat" },
      { "kind": "block", "type": "label_def" },
      { "kind": "sep", "gap": "12" },
      { "kind": "block", "type": "sm" },
      { "kind": "block", "type": "sc" },
      { "kind": "block", "type": "su" },
      { "kind": "block", "type": "ad" },
      { "kind": "block", "type": "xr" },
      { "kind": "block", "type": "or" },
      { "kind": "block", "type": "an" },
      { "kind": "block", "type": "sa" },
      { "kind": "block", "type": "lm" },
      { "kind": "block", "type": "ld" },
      { "kind": "block", "type": "li" },
      { "kind": "block", "type": "jp" },
      { "kind": "block", "type": "np" },
      { "kind": "block", "type": "goto" },
      { "kind": "block", "type": "goto_if" }
    ]
  };
}

// --- Blockly初期化関数 ---
function initializeWorkspace() {
  // 既存のワークスペースがある場合は破棄
  if (window.vasmWorkspace) {
    window.vasmWorkspace.dispose();
    window.vasmWorkspace = null;
  }
  
  // ブロックとコードジェネレータを初期化
  initializeBlocks();
  initializeCodeGenerator();
  
  // ツールボックス設定
  const toolbox = getToolboxConfig();
  
  // Blockly初期化
  var workspace = Blockly.inject('blocklyDiv', {
    toolbox: toolbox,
    move: {
      scrollbars: {
        horizontal: true,
        vertical: true
      },
      drag: true,
      wheel: true
    },
    zoom: {
      controls: true,
      wheel: true,
      startScale: 1.0,
      maxScale: 3,
      minScale: 0.3,
      scaleSpeed: 1.2,
      pinch: true
    }
  });

  // ハットブロックから開始されるコードを生成する関数
  function generateCodeFromHatBlocks(workspace) {
    var code = '';
    var allBlocks = workspace.getAllBlocks();
    
    // ハットブロックのみを探して処理
    for (var i = 0; i < allBlocks.length; i++) {
      var block = allBlocks[i];
      if (block.type === 'label_hat') {
        // ハットブロックから始まるブロック列をたどって処理
        var currentBlock = block;
        while (currentBlock) {
          try {
            var blockCode = Blockly.Assembly.forBlock[currentBlock.type];
            if (blockCode && typeof blockCode === 'function') {
              var generatedCode = blockCode.call(null, currentBlock);
              if (generatedCode) {
                code += generatedCode;
              }
            }
          } catch (error) {
            console.error('Block code generation error for', currentBlock.type, ':', error);
          }
          currentBlock = currentBlock.getNextBlock();
        }
      }
    }
    
    return code;
  }

  // 変更があるたびにコード生成して出力
  function updateCode() {
    try {
      // ハットブロックに接続されたブロック列のみを処理
      var code = generateCodeFromHatBlocks(workspace);
      var outputDiv = document.getElementById('output');
      if (outputDiv) {
        if (code.trim() === '') {
          outputDiv.textContent = '生成されたアセンブリコードがここに表示されます...';
        } else {
          outputDiv.textContent = code;
        }
        // スクロールして常に最新のコードが見えるようにする
        outputDiv.scrollTop = outputDiv.scrollHeight;
      }
    } catch (error) {
      console.error('[ERROR] コード生成中にエラーが発生:', error);
      var outputDiv = document.getElementById('output');
      if (outputDiv) {
        outputDiv.textContent = 'コード生成エラー: ' + error.message;
      }
    }
  }
  
  workspace.addChangeListener(updateCode);
  
  // 初期化完了後に一度コードを生成
  setTimeout(updateCode, 100);
  
  return workspace;
}
