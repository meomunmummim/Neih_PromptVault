let appState = {
  groups: [], // Array of string names
  prompts: [] // Array of { id, title, content, group }
};

let editingPromptId = null;
let activePromptForFill = null;

// DOM Elements
const contentArea = document.getElementById('contentArea');
const searchInput = document.getElementById('searchInput');
const editorModal = document.getElementById('editorModal');
const fillModal = document.getElementById('fillModal');
const toast = document.getElementById('toast');

// Inputs
const editTitle = document.getElementById('editTitle');
const editContent = document.getElementById('editContent');
const editGroupSelect = document.getElementById('editGroupSelect');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  render();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('btnNewPrompt').onclick = () => openEditor();
  document.getElementById('btnNewGroup').onclick = createGroup;
  document.getElementById('btnCancelEdit').onclick = closeEditor;
  document.getElementById('btnSavePrompt').onclick = savePrompt;
  document.getElementById('btnAddVar').onclick = insertVarSnippet;
  document.getElementById('btnCancelFill').onclick = () => fillModal.classList.add('hidden');
  document.getElementById('btnCopyResult').onclick = handleCopy;
  document.getElementById('btnInsertResult').onclick = handleInsert;
  document.getElementById('btnDeleteAll').onclick = deleteAllData;
  searchInput.oninput = render;

  // CSV Export & Import Handlers
  document.getElementById('btnExportCsv').onclick = exportToCsv;
  document.getElementById('btnImportCsv').onclick = () => document.getElementById('csvFileInput').click();
  document.getElementById('csvFileInput').onchange = importFromCsv;
}

// --- Storage Handlers ---
async function loadState() {
  const result = await chrome.storage.local.get(['groups', 'prompts']);
  // Change: Start with empty lists [] instead of default names
  appState.groups = result.groups || [];
  appState.prompts = result.prompts || [];
}

async function saveState() {
  await chrome.storage.local.set(appState);
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// --- Render Logic ---
function render() {
  contentArea.innerHTML = '';
  const filter = searchInput.value.toLowerCase().trim();

  // Filter prompts
  const filteredPrompts = appState.prompts.filter(p => 
    p.title.toLowerCase().includes(filter) || 
    p.content.toLowerCase().includes(filter) ||
    (p.group && p.group.toLowerCase().includes(filter))
  );

  // Group Prompts by Group Name
  const grouped = {};
  appState.groups.forEach(g => grouped[g] = []);
  grouped['Ungrouped'] = [];

  filteredPrompts.forEach(p => {
    const key = p.group && appState.groups.includes(p.group) ? p.group : 'Ungrouped';
    grouped[key].push(p);
  });

  // Render Groups
  appState.groups.forEach((groupName, index) => {
    const prompts = grouped[groupName] || [];
    if (filter && prompts.length === 0) return;

    const groupEl = document.createElement('div');
    groupEl.className = 'group-card';
    groupEl.dataset.group = groupName;

    // Drag-and-drop support for groups
    groupEl.ondragover = (e) => { e.preventDefault(); groupEl.classList.add('drag-over'); };
    groupEl.ondragleave = () => groupEl.classList.remove('drag-over');
    groupEl.ondrop = (e) => {
      e.preventDefault();
      groupEl.classList.remove('drag-over');
      const promptId = e.dataTransfer.getData('text/plain');
      movePromptToGroup(promptId, groupName);
    };

    groupEl.innerHTML = `
      <div class="group-header">
        <span>📂 ${escapeHtml(groupName)} (${prompts.length})</span>
        <div style="display: flex; gap: 6px; align-items: center;">
          <button class="btn-mini btn-secondary btn-move-up" title="Move Up">↑</button>
          <button class="btn-mini btn-secondary btn-move-down" title="Move Down">↓</button>
          <button class="btn-mini btn-secondary btn-del-group" style="color:#ef4444; padding: 2px 6px;" title="Delete Group">🗑️</button>
          <span>▼</span>
        </div>
      </div>
      <div class="group-body"></div>
    `;

    const header = groupEl.querySelector('.group-header');
    const body = groupEl.querySelector('.group-body');
    const delBtn = groupEl.querySelector('.btn-del-group');
    const btnUp = groupEl.querySelector('.btn-move-up');
    const btnDown = groupEl.querySelector('.btn-move-down');

    if (btnUp) {
      btnUp.onclick = (e) => {
        e.stopPropagation();
        moveGroupPosition(index, -1); // -1 moves it up the list
      };
    }
    if (btnDown) {
      btnDown.onclick = (e) => {
        e.stopPropagation();
        moveGroupPosition(index, 1); // 1 moves it down the list
      };
    }


    // Safe collapse toggle handler
    if (header && body) {
      header.onclick = () => body.classList.toggle('collapsed');
    }

    // Delete group handler without collapsing
    if (delBtn) {
      delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteGroup(groupName);
      };
    }

    if (body) {
      prompts.forEach(p => body.appendChild(createPromptElement(p)));
    }

    contentArea.appendChild(groupEl);
  });

  // Render Ungrouped Prompts
  const ungroupedPrompts = grouped['Ungrouped'] || [];
  if (ungroupedPrompts.length > 0) {
    const sectionTitle = document.createElement('div');
    sectionTitle.style.cssText = 'font-size: 11px; font-weight:700; color:#64748b; margin: 12px 0 6px 4px;';
    sectionTitle.textContent = 'UNGROUPED PROMPTS';
    contentArea.appendChild(sectionTitle);

    ungroupedPrompts.forEach(p => contentArea.appendChild(createPromptElement(p)));
  }
}

function createPromptElement(prompt) {
  const el = document.createElement('div');
  el.className = 'prompt-item';
  el.draggable = true;

  el.ondragstart = (e) => {
    e.dataTransfer.setData('text/plain', prompt.id);
  };

  el.innerHTML = `
    <div class="prompt-title">${escapeHtml(prompt.title)}</div>
    <div class="prompt-preview">${escapeHtml(prompt.content)}</div>
    <div class="prompt-actions">
      <button class="btn-mini btn-primary btn-use">Use</button>
      <button class="btn-mini btn-secondary btn-edit">Edit</button>
      <button class="btn-mini btn-secondary btn-del" style="color:#ef4444;">Delete</button>
    </div>
  `;

  el.querySelector('.btn-use').onclick = (e) => { e.stopPropagation(); openFillModal(prompt); };
  el.querySelector('.btn-edit').onclick = (e) => { e.stopPropagation(); openEditor(prompt); };
  el.querySelector('.btn-del').onclick = (e) => { e.stopPropagation(); deletePrompt(prompt.id); };
  el.onclick = () => openFillModal(prompt);

  return el;
}

// --- Group Management ---
async function createGroup() {
  const name = window.prompt('Enter new group name:');
  if (name && !appState.groups.includes(name.trim())) {
    appState.groups.push(name.trim());
    await saveState();
    render();
  }
}

async function deleteGroup(groupName) {
  if (confirm(`Delete group "${groupName}"?\nPrompts inside will move to Ungrouped.`)) {
    appState.groups = appState.groups.filter(g => g !== groupName);

    appState.prompts.forEach(p => {
      if (p.group === groupName) {
        p.group = "";
      }
    });

    await saveState();
    render();
    showToast(`Deleted group "${groupName}"`);
  }
}

async function movePromptToGroup(promptId, targetGroup) {
  const p = appState.prompts.find(x => x.id === promptId);
  if (p) {
    p.group = targetGroup;
    await saveState();
    render();
  }
}

async function moveGroupPosition(index, direction) {
  const newIndex = index + direction;
  
  // Check if we can move it (not too far up or down)
  if (newIndex >= 0 && newIndex < appState.groups.length) {
    // Swap the groups
    const temp = appState.groups[index];
    appState.groups[index] = appState.groups[newIndex];
    appState.groups[newIndex] = temp;
    
    await saveState();
    render();
  }
}
// --- Prompt Editor Modal ---
function openEditor(prompt = null) {
  editingPromptId = prompt ? prompt.id : null;
  document.getElementById('modalTitle').textContent = prompt ? 'Edit Prompt' : 'New Prompt';
  
  editTitle.value = prompt ? prompt.title : '';
  editContent.value = prompt ? prompt.content : '';

  // Populate Group Dropdown
  editGroupSelect.innerHTML = '<option value="">(None - Ungrouped)</option>';
  appState.groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    if (prompt && prompt.group === g) opt.selected = true;
    editGroupSelect.appendChild(opt);
  });

  editorModal.classList.remove('hidden');
}

function closeEditor() {
  editorModal.classList.add('hidden');
}

function insertVarSnippet() {
  const varName = window.prompt('Variable name:', 'newword');
  if (varName) {
    const snippet = `{{${varName.trim()}}}`;
    const start = editContent.selectionStart;
    const end = editContent.selectionEnd;
    const text = editContent.value;
    editContent.value = text.substring(0, start) + snippet + text.substring(end);
    editContent.focus();
  }
}

async function savePrompt() {
  const title = editTitle.value.trim();
  const content = editContent.value.trim();
  const group = editGroupSelect.value;

  if (!title || !content) {
    alert('Please provide both title and content.');
    return;
  }

  if (editingPromptId) {
    const idx = appState.prompts.findIndex(p => p.id === editingPromptId);
    if (idx !== -1) appState.prompts[idx] = { id: editingPromptId, title, content, group };
  } else {
    appState.prompts.push({ id: Date.now().toString(), title, content, group });
  }

  await saveState();
  closeEditor();
  render();
}

async function deletePrompt(id) {
  if (confirm('Delete this prompt?')) {
    appState.prompts = appState.prompts.filter(p => p.id !== id);
    await saveState();
    render();
  }
}

// --- Dynamic Variable Filling Modal ---
function openFillModal(prompt) {
  activePromptForFill = prompt;
  document.getElementById('fillTitle').textContent = prompt.title;
  document.getElementById('fillPreview').textContent = prompt.content;

  const varsContainer = document.getElementById('varsContainer');
  varsContainer.innerHTML = '';

  // Extract variables via Regex: {{varName}}
  const regex = /\{\{(.*?)\}\}/g;
  const matches = [...new Set([...prompt.content.matchAll(regex)].map(m => m[1].trim()))];

  if (matches.length === 0) {
    varsContainer.innerHTML = '<div style="font-size:12px; color:#64748b;">No variables needed for this prompt!</div>';
  } else {
    matches.forEach(varName => {
      const fieldWrapper = document.createElement('div');
      fieldWrapper.innerHTML = `
        <div class="field-label">${escapeHtml(varName)}</div>
        <input type="text" class="input-field var-input" data-var="${escapeHtml(varName)}" placeholder="Enter value for ${escapeHtml(varName)}...">
      `;
      varsContainer.appendChild(fieldWrapper);
    });
  }

  fillModal.classList.remove('hidden');
}

function getFilledPromptText() {
  let filledText = activePromptForFill.content;
  const inputs = document.querySelectorAll('.var-input');
  
  inputs.forEach(input => {
    const varName = input.dataset.var;
    const val = input.value || `{{${varName}}}`;
    const regex = new RegExp(`\\{\\{\\s*${varName}\\s*\\}\\}`, 'g');
    filledText = filledText.replace(regex, val);
  });

  return filledText;
}

function handleCopy() {
  const text = getFilledPromptText();
  navigator.clipboard.writeText(text);
  showToast('Copied to clipboard!');
}

async function handleInsert() {
  const text = getFilledPromptText();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab) {
    chrome.tabs.sendMessage(tab.id, { action: 'INSERT_PROMPT', text: text }, (response) => {
      if (response && response.success) {
        showToast('Inserted into web page!');
      } else {
        navigator.clipboard.writeText(text);
        showToast('Copied! (Couldn\'t find chat input)');
      }
    });
  }
}
async function deleteAllData() {
  if (confirm("Are you sure? This will delete ALL groups and prompts!")) {
    appState.groups = [];
    appState.prompts = [];
    await saveState();
    render();
    showToast("Everything deleted!");
  }
}
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// --- Native Export to CSV ---
function exportToCsv() {
  if (appState.prompts.length === 0) {
    alert("No prompts to export!");
    return;
  }

  const headers = ["id", "group", "title", "content"];
  const rows = appState.prompts.map(p => [
    p.id,
    p.group || "",
    p.title,
    p.content
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map(row => 
      row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(",")
    )
  ].join("\r\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "Neih_PromptVault_Backup.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("Exported to CSV!");
}

// --- Native Import from CSV ---
function importFromCsv(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const text = e.target.result;
      const rows = parseCsvText(text);

      if (rows.length < 2) {
        alert("File is empty or missing data!");
        return;
      }

      const headers = rows[0].map(h => h.trim().toLowerCase());
      const idIdx = headers.indexOf("id");
      const groupIdx = headers.indexOf("group");
      const titleIdx = headers.indexOf("title");
      const contentIdx = headers.indexOf("content");

      if (titleIdx === -1 || contentIdx === -1) {
        alert("CSV must contain at least 'title' and 'content' columns!");
        return;
      }

      let importedCount = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2) continue;

        const title = row[titleIdx] ? row[titleIdx].trim() : "";
        const content = row[contentIdx] ? row[contentIdx].trim() : "";
        const group = groupIdx !== -1 && row[groupIdx] ? row[groupIdx].trim() : "";
        const id = idIdx !== -1 && row[idIdx] ? row[idIdx].trim() : (Date.now() + i).toString();

        if (title && content) {
          if (group && !appState.groups.includes(group)) {
            appState.groups.push(group);
          }

          const existingIdx = appState.prompts.findIndex(p => p.id === id);
          if (existingIdx !== -1) {
            appState.prompts[existingIdx] = { id, group, title, content };
          } else {
            appState.prompts.push({ id, group, title, content });
          }
          importedCount++;
        }
      }

      await saveState();
      render();
      showToast(`Imported ${importedCount} prompts!`);
    } catch (err) {
      alert("Error parsing CSV file. Please check format.");
    }
  };

  reader.readAsText(file);
  event.target.value = "";
}

// Helper to safely parse CSV with quotes and multi-line contents
function parseCsvText(text) {
  const result = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.length > 1 || row[0] !== '') result.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    result.push(row);
  }

  return result;
}