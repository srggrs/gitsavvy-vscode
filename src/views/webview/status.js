// @ts-check

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  /** @type {import('../../types').RepoStatus | null} */
  let currentStatus = null;

  /** @type {{ section: string, index: number }} */
  let cursor = { section: 'staged', index: 0 };

  const sections = ['staged', 'unstaged', 'untracked'];

  function render() {
    if (!currentStatus) return;

    const header = document.getElementById('header');
    const sectionsEl = document.getElementById('sections');
    if (!header || !sectionsEl) return;

    header.innerHTML = [
      '<div class="header-line"><span class="header-label">BRANCH:</span> <span class="header-value">' + esc(currentStatus.branch) + '</span></div>',
      '<div class="header-line"><span class="header-label">HEAD:</span> <span class="header-value">' + esc(currentStatus.head) + ' ' + esc(currentStatus.headMessage) + '</span></div>',
    ].join('');

    const sectionData = {
      staged: currentStatus.staged,
      unstaged: currentStatus.unstaged,
      untracked: currentStatus.untracked,
    };

    let html = '';
    for (const name of sections) {
      const files = sectionData[name];
      html += '<div class="section-header">## ' + name + ' files</div>';
      if (files.length === 0) {
        html += '<div class="empty-section">  (empty)</div>';
      } else {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const selected = cursor.section === name && cursor.index === i;
          const label = f.origPath ? f.path + ' \u2190 ' + f.origPath : f.path;
          html += '<div class="file-entry' + (selected ? ' selected' : '') + '"'
            + ' data-section="' + name + '" data-index="' + i + '" data-path="' + esc(f.path) + '">'
            + '<span class="file-status ' + esc(f.statusCode) + '">' + esc(f.statusCode) + '</span>'
            + '<span class="file-path">' + esc(label) + '</span>'
            + '</div>';
        }
      }
    }
    sectionsEl.innerHTML = html;

    // Scroll selected into view
    const selected = document.querySelector('.file-entry.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  /** @param {string} s */
  function esc(s) {
    const el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  }

  function getFilesForSection(section) {
    if (!currentStatus) return [];
    return currentStatus[section] || [];
  }

  function getSelectedFile() {
    const files = getFilesForSection(cursor.section);
    return files[cursor.index] || null;
  }

  function moveCursor(direction) {
    if (!currentStatus) return;
    const files = getFilesForSection(cursor.section);

    if (direction === 'down') {
      if (cursor.index < files.length - 1) {
        cursor.index++;
      } else {
        // Move to next non-empty section
        var si = sections.indexOf(cursor.section);
        for (var i = 1; i <= sections.length; i++) {
          var nextSection = sections[(si + i) % sections.length];
          if (getFilesForSection(nextSection).length > 0) {
            cursor.section = nextSection;
            cursor.index = 0;
            break;
          }
        }
      }
    } else if (direction === 'up') {
      if (cursor.index > 0) {
        cursor.index--;
      } else {
        // Move to previous non-empty section
        var si = sections.indexOf(cursor.section);
        for (var i = 1; i <= sections.length; i++) {
          var prevSection = sections[(si - i + sections.length) % sections.length];
          var prevFiles = getFilesForSection(prevSection);
          if (prevFiles.length > 0) {
            cursor.section = prevSection;
            cursor.index = prevFiles.length - 1;
            break;
          }
        }
      }
    }
    render();
  }

  function cycleSection() {
    if (!currentStatus) return;
    var si = sections.indexOf(cursor.section);
    for (var i = 1; i <= sections.length; i++) {
      var nextSection = sections[(si + i) % sections.length];
      if (getFilesForSection(nextSection).length > 0) {
        cursor.section = nextSection;
        cursor.index = 0;
        render();
        break;
      }
    }
  }

  function clampCursor() {
    var files = getFilesForSection(cursor.section);
    if (files.length === 0) {
      // Find first non-empty section
      for (var s = 0; s < sections.length; s++) {
        if (getFilesForSection(sections[s]).length > 0) {
          cursor.section = sections[s];
          cursor.index = 0;
          return;
        }
      }
      cursor.index = 0;
    } else {
      cursor.index = Math.min(cursor.index, files.length - 1);
    }
  }

  // Keyboard handling
  document.addEventListener('keydown', function(e) {
    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault();
        moveCursor('down');
        break;
      case 'k':
      case 'ArrowUp':
        e.preventDefault();
        moveCursor('up');
        break;
      case 'Tab':
        e.preventDefault();
        cycleSection();
        break;
      case 's': {
        var file = getSelectedFile();
        if (file) {
          vscode.postMessage({ type: 'stage', files: [file.path] });
        }
        break;
      }
      case 'u': {
        var file = getSelectedFile();
        if (file) {
          vscode.postMessage({ type: 'unstage', files: [file.path] });
        }
        break;
      }
      case 'd': {
        var file = getSelectedFile();
        if (file) {
          vscode.postMessage({ type: 'openDiff', file: file.path });
        }
        break;
      }
      case 'Enter': {
        var file = getSelectedFile();
        if (file) {
          vscode.postMessage({ type: 'openFile', file: file.path });
        }
        break;
      }
      case 'r':
        vscode.postMessage({ type: 'refresh' });
        break;
      case 'c':
        vscode.postMessage({ type: 'commit' });
        break;
    }
  });

  // Click handling
  document.addEventListener('click', function(e) {
    var entry = e.target.closest('.file-entry');
    if (entry) {
      var section = entry.getAttribute('data-section');
      var index = parseInt(entry.getAttribute('data-index') || '0', 10);
      if (section) {
        cursor.section = section;
        cursor.index = index;
        render();
      }
    }
  });

  // Message handling
  window.addEventListener('message', function(e) {
    var msg = e.data;
    switch (msg.type) {
      case 'status':
        currentStatus = msg.data;
        clampCursor();
        render();
        break;
      case 'error':
        var header = document.getElementById('header');
        if (header) {
          header.innerHTML = '<div class="header-line" style="color: var(--vscode-errorForeground)">Error: ' + esc(msg.message) + '</div>';
        }
        break;
    }
  });
})();
