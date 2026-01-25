// ============================================
// SSH WEB CLIENT - Real SSH Connection
// ============================================

const socket = io();
let term = null;
let fitAddon = null;
let shellStarted = false;

// State Management
const state = {
    sshConfig: { host: '', port: 22, user: '', password: '', homeDir: '/' },
    currentPath: '/',
    isConnected: false,
    currentFiles: [],
    currentEditorFile: null,
    editorCodeMirror: null
};

// ============================================
// SOCKET.IO EVENT HANDLERS
// ============================================

socket.on('ssh-connected', (data) => {
    hideLoading();
    state.isConnected = true;
    state.currentFiles = data.files;
    state.currentPath = data.currentPath || '/';

    // Update UI
    document.getElementById('connection-info').textContent = `${state.sshConfig.user}@${state.sshConfig.host}:${state.sshConfig.port}`;
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    renderFileTable(data.files);
    updateBreadcrumb(state.currentPath);
    showToast(`Connected to ${state.sshConfig.host}`, 'success');

    // Start interactive shell
    startShell();
});

socket.on('ssh-error', (data) => {
    hideLoading();
    document.getElementById('login-error').textContent = data.message;
    document.getElementById('login-error').classList.remove('hidden');
    showToast(data.message, 'error');
});

socket.on('directory-listed', (data) => {
    state.currentFiles = data.files;
    state.currentPath = data.path;
    renderFileTable(data.files);
    updateBreadcrumb(data.path);
});

socket.on('file-read', (data) => {
    openEditor(data.path, data.content);
});

socket.on('file-saved', (data) => {
    showToast(`File saved: ${data.path}`, 'success');
    closeEditor();
    refreshFiles();
});

socket.on('file-deleted', (data) => {
    showToast(`File deleted`, 'success');
    refreshFiles();
});

socket.on('directory-created', (data) => {
    showToast(`Directory created: ${data.path}`, 'success');
    refreshFiles();
});

socket.on('file-renamed', (data) => {
    showToast(`File renamed`, 'success');
    refreshFiles();
});

socket.on('permissions-changed', (data) => {
    showToast(`Permissions changed to ${data.mode}`, 'success');
    refreshFiles();
});

socket.on('search-results', (data) => {
    document.getElementById('search-loading').classList.add('hidden');
    renderSearchResults(data.results);
});

socket.on('file-download-data', (data) => {
    saveDownloadedFile(data.filename, data.data);
});

socket.on('shell-started', () => {
    shellStarted = true;
    console.log('Shell started');
});

socket.on('shell-output', (data) => {
    if (term) {
        term.write(data.data);
    }
});

socket.on('shell-closed', () => {
    shellStarted = false;
    if (term) {
        term.write('\r\nConnection closed\r\n');
    }
});

socket.on('shell-error', (data) => {
    showToast(`Shell error: ${data.message}`, 'error');
});

socket.on('file-uploaded', (data) => {
    hideLoading();
    document.getElementById('upload-progress').classList.add('hidden');
    showToast(`File uploaded: ${data.remotePath}`, 'success');
    closeUploadDialog();
    refreshFiles();
});

socket.on('archive-compressed', (data) => {
    hideLoading();
    showToast(`Archive created: ${data.archivePath}`, 'success');
    closeCompressDialog();
    refreshFiles();
});

socket.on('archive-extracted', (data) => {
    hideLoading();
    showToast(`Archive extracted to: ${data.destinationPath}`, 'success');
    closeExtractDialog();
    refreshFiles();
});

socket.on('error', (data) => {
    showToast(data.message, 'error');
});

socket.on('disconnect', () => {
    if (state.isConnected) {
        showToast('Connection to server lost', 'error');
    }
});

// ============================================
// LOGIN & CONNECTION
// ============================================

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('login-error').classList.add('hidden');

    const host = document.getElementById('ssh-host').value;
    const port = document.getElementById('ssh-port').value;
    const user = document.getElementById('ssh-user').value;
    const password = document.getElementById('ssh-password').value;
    const homeDir = document.getElementById('ssh-home').value || '/';

    if (!host || !user || !password) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    state.sshConfig = { host, port: parseInt(port), user, password, homeDir };
    showLoading('Connecting to SSH server...');

    socket.emit('ssh-connect', state.sshConfig);
});

function disconnectSSH() {
    if (confirm('Are you sure you want to disconnect?')) {
        socket.disconnect();
        location.reload();
    }
}

// ============================================
// TERMINAL
// ============================================

function startShell() {
    const terminalContainer = document.getElementById('terminal');

    // Initialize xterm.js with macOS Terminal style
    term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 13,
        lineHeight: 1.2,
        letterSpacing: 0,
        fontFamily: '"SF Mono", "Menlo", "Monaco", "Consolas", "JetBrains Mono", monospace',
        scrollback: 1000,
        convertEol: true,
        termName: 'xterm-256color',
        theme: {
            background: '#1e1e1e',
            foreground: '#ffffff',
            cursor: '#ffffff',
            cursorAccent: '#1e1e1e',
            selection: 'rgba(255, 255, 255, 0.2)',
            black: '#000000',
            red: '#ff5f56',
            green: '#27c93f',
            yellow: '#ffbd2e',
            blue: '#27c93f',
            magenta: '#ff5f56',
            cyan: '#27c93f',
            white: '#ffffff',
            brightBlack: '#666666',
            brightRed: '#ff5f56',
            brightGreen: '#27c93f',
            brightYellow: '#ffbd2e',
            brightBlue: '#27c93f',
            brightMagenta: '#ff5f56',
            brightCyan: '#27c93f',
            brightWhite: '#ffffff',
        }
    });

    // Load fit addon
    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalContainer);
    fitAddon.fit();

    // Handle terminal input
    term.onData((data) => {
        if (shellStarted) {
            socket.emit('shell-input', data);
        }
    });

    // Handle terminal resize with debounce
    let resizeTimeout;
    const handleResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (fitAddon) {
                fitAddon.fit();
                socket.emit('resize-shell', {
                    rows: term.rows,
                    cols: term.cols
                });
            }
        }, 100);
    };

    window.addEventListener('resize', handleResize);

    // Initial resize after a short delay
    setTimeout(handleResize, 200);

    // Start shell on server
    socket.emit('start-shell');
}

function clearTerminal() {
    if (term) {
        term.clear();
    }
}

function toggleTerminal() {
    const panel = document.getElementById('terminal-panel');
    const terminalDiv = document.getElementById('terminal');
    const isHidden = panel.style.display === 'none';
    const isMinimized = panel.style.height === '40px';

    if (isHidden) {
        panel.style.display = 'flex';
        setTimeout(() => {
            if (fitAddon) fitAddon.fit();
        }, 50);
    } else if (isMinimized) {
        // Restore from minimized
        panel.style.height = '';
        panel.classList.add('h-96');
        terminalDiv.style.display = 'block';
        setTimeout(() => {
            if (fitAddon) fitAddon.fit();
        }, 50);
    } else {
        // Hide terminal
        panel.style.display = 'none';
    }
}

function expandTerminal() {
    const panel = document.getElementById('terminal-panel');
    const isExpanded = panel.classList.contains('h-[600px]');

    if (isExpanded) {
        panel.classList.remove('h-[600px]');
        panel.classList.add('h-96');
    } else {
        panel.classList.remove('h-96');
        panel.classList.add('h-[600px]');
    }

    setTimeout(() => {
        if (fitAddon) fitAddon.fit();
    }, 50);
}

function minimizeTerminal() {
    const panel = document.getElementById('terminal-panel');
    const terminalDiv = document.getElementById('terminal');
    panel.style.height = '40px';
    terminalDiv.style.display = 'none';
}

// ============================================
// FILE BROWSER
// ============================================

function navigateToPath(path) {
    state.currentPath = path;
    socket.emit('list-directory', path);
}

function renderFileTable(files) {
    const tbody = document.getElementById('file-table-body');

    if (!files || files.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-4 py-12 text-center text-text-muted">
                    <span class="material-symbols-outlined text-4xl mb-2 opacity-50">folder_open</span>
                    <p class="text-sm">This directory is empty</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = files.map((file, index) => {
        const icon = getFileIcon(file);
        const size = file.type === 'dir' ? '-' : formatFileSize(file.size);
        const permissions = formatPermissions(file.permissions);
        const modified = formatDate(file.modified);

        return `
            <tr class="group hover:bg-white/[0.02] transition-colors border-l-2 border-l-transparent hover:border-l-primary">
                <td class="px-4 py-3">
                    <input type="checkbox" class="file-checkbox rounded bg-background-dark border-border-dark text-primary focus:ring-0"/>
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined ${icon.color} text-[18px]">${icon.name}</span>
                        <span class="text-white text-sm font-medium cursor-pointer hover:text-primary" onclick="openFile('${file.name}', '${file.type}')">${file.name}</span>
                    </div>
                </td>
                <td class="px-4 py-3 text-xs text-text-muted">${size}</td>
                <td class="px-4 py-3 font-mono text-xs text-primary/80">${permissions}</td>
                <td class="px-4 py-3 text-xs text-text-muted">${modified}</td>
                <td class="px-4 py-3 text-right">
                    <div class="relative inline-block">
                        <button onclick="toggleFileMenu(${index})" class="text-text-muted hover:text-white p-1 rounded hover:bg-white/10">
                            <span class="material-symbols-outlined text-[18px]">more_vert</span>
                        </button>
                        <div id="file-menu-${index}" class="hidden absolute right-0 top-full mt-1 bg-surface border border-border-dark rounded shadow-xl z-50 min-w-[160px] py-1">
                            <button onclick="editFile('${file.name}')" class="w-full px-4 py-2 text-left text-xs hover:bg-primary/10 hover:text-primary text-text-muted flex items-center gap-2">
                                <span class="material-symbols-outlined text-[16px]">edit</span> Edit
                            </button>
                            <button onclick="downloadFile('${file.name}')" class="w-full px-4 py-2 text-left text-xs hover:bg-primary/10 hover:text-primary text-text-muted flex items-center gap-2">
                                <span class="material-symbols-outlined text-[16px]">download</span> Download
                            </button>
                            <button onclick="showCompressDialog('${file.name}', '${file.type}')" class="w-full px-4 py-2 text-left text-xs hover:bg-primary/10 hover:text-primary text-text-muted flex items-center gap-2">
                                <span class="material-symbols-outlined text-[16px]">folder_zip</span> Compress
                            </button>
                            <button onclick="showExtractDialog('${file.name}')" class="archive-action w-full px-4 py-2 text-left text-xs hover:bg-primary/10 hover:text-primary text-text-muted flex items-center gap-2 ${file.name.match(/\.(zip|tar\.gz|tgz|tar\.bz2|tbz2|tar|gz)$/i) ? '' : 'hidden'}">
                                <span class="material-symbols-outlined text-[16px]">unzip</span> Extract
                            </button>
                            <button onclick="renameFile('${file.name}')" class="w-full px-4 py-2 text-left text-xs hover:bg-primary/10 hover:text-primary text-text-muted flex items-center gap-2">
                                <span class="material-symbols-outlined text-[16px]">drive_file_rename_outline</span> Rename
                            </button>
                            <button onclick="changePermissions('${file.name}')" class="w-full px-4 py-2 text-left text-xs hover:bg-primary/10 hover:text-primary text-text-muted flex items-center gap-2">
                                <span class="material-symbols-outlined text-[16px]">lock</span> Permissions
                            </button>
                            <div class="h-px bg-border-dark my-1"></div>
                            <button onclick="deleteFile('${file.name}')" class="w-full px-4 py-2 text-left text-xs hover:bg-danger/10 hover:text-danger text-danger flex items-center gap-2">
                                <span class="material-symbols-outlined text-[16px]">delete</span> Delete
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function getFileIcon(file) {
    if (file.type === 'dir') {
        return { name: 'folder', color: 'text-yellow-500' };
    }

    const ext = file.name.split('.').pop().toLowerCase();
    const iconMap = {
        'html': { name: 'code', color: 'text-orange-400' },
        'js': { name: 'javascript', color: 'text-yellow-400' },
        'css': { name: 'css', color: 'text-blue-400' },
        'json': { name: 'data_object', color: 'text-green-400' },
        'md': { name: 'description', color: 'text-gray-400' },
        'sh': { name: 'terminal', color: 'text-green-500' },
        'log': { name: 'description', color: 'text-gray-500' },
        'png': { name: 'image', color: 'text-purple-400' },
        'jpg': { name: 'image', color: 'text-purple-400' },
        'jpeg': { name: 'image', color: 'text-purple-400' },
        'txt': { name: 'text_snippet', color: 'text-gray-400' },
    };

    return iconMap[ext] || { name: 'description', color: 'text-gray-400' };
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit++;
    }
    return size.toFixed(1) + ' ' + units[unit];
}

function formatPermissions(mode) {
    if (typeof mode === 'number') {
        const str = mode.toString(8);
        return str.slice(-3);
    }
    return mode || '644';
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString();
}

function updateBreadcrumb(path) {
    const parts = path.split('/').filter(p => p);
    const breadcrumb = document.getElementById('breadcrumb');

    let html = `
        <button onclick="navigateToPath('/')" class="text-text-muted hover:text-primary transition-colors text-sm">/</button>
    `;

    let currentPath = '';
    parts.forEach((part, index) => {
        currentPath += '/' + part;
        const isLast = index === parts.length - 1;
        if (isLast) {
            html += `<span class="text-text-muted">/</span><span class="text-white font-semibold text-sm bg-surface px-2 py-1 rounded border border-border-dark">${part}</span>`;
        } else {
            html += `<span class="text-text-muted">/</span><button onclick="navigateToPath('${currentPath}')" class="text-text-muted hover:text-primary transition-colors text-sm">${part}</button>`;
        }
    });

    breadcrumb.innerHTML = html;
    document.getElementById('current-path-display').textContent = path;
}

// ============================================
// FILE OPERATIONS
// ============================================

function openFile(name, type) {
    if (type === 'dir') {
        const newPath = state.currentPath === '/' ? '/' + name : state.currentPath + '/' + name;
        navigateToPath(newPath);
    } else {
        editFile(name);
    }
}

function editFile(name) {
    const filePath = state.currentPath === '/' ? '/' + name : state.currentPath + '/' + name;
    socket.emit('read-file', filePath);
}

function downloadFile(name) {
    const filePath = state.currentPath === '/' ? '/' + name : state.currentPath + '/' + name;
    showLoading('Downloading file...');
    socket.emit('download-file', filePath);
}

function saveDownloadedFile(filename, base64Data) {
    try {
        // Convert base64 to blob
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Create blob and download link
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        hideLoading();
        showToast(`File downloaded: ${filename}`, 'success');
    } catch (error) {
        hideLoading();
        showToast(`Download failed: ${error.message}`, 'error');
    }
}

function openEditor(filePath, content) {
    state.currentEditorFile = { path: filePath, content };

    document.getElementById('editor-filename').textContent = filePath.split('/').pop();
    document.getElementById('editor-path').textContent = filePath;
    document.getElementById('editor-modal').classList.remove('hidden');

    setTimeout(() => {
        if (state.editorCodeMirror) {
            state.editorCodeMirror.toTextArea();
        }

        const filename = filePath.split('/').pop();
        const mode = getFileMode(filename);

        state.editorCodeMirror = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
            mode: mode,
            theme: 'dracula',
            lineNumbers: true,
            autoCloseBrackets: true,
            matchBrackets: true,
            indentUnit: 4,
            tabSize: 4,
        });

        state.editorCodeMirror.setValue(content || '');
        state.editorCodeMirror.refresh();
    }, 100);
}

function getFileMode(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const modes = {
        'js': 'javascript',
        'json': { name: 'javascript', json: true },
        'html': 'htmlmixed',
        'css': 'css',
        'sh': 'shell',
        'py': 'python',
        'md': 'markdown',
    };
    return modes[ext] || 'text';
}

function saveFile() {
    if (!state.currentEditorFile || !state.editorCodeMirror) return;

    const content = state.editorCodeMirror.getValue();
    socket.emit('write-file', {
        path: state.currentEditorFile.path,
        content: content
    });
}

function closeEditor() {
    document.getElementById('editor-modal').classList.add('hidden');
    if (state.editorCodeMirror) {
        state.editorCodeMirror.toTextArea();
        state.editorCodeMirror = null;
    }
    state.currentEditorFile = null;
}

function toggleFileMenu(index) {
    event.stopPropagation();
    const menu = document.getElementById(`file-menu-${index}`);
    document.querySelectorAll('[id^="file-menu-"]').forEach(m => {
        if (m !== menu) m.classList.add('hidden');
    });
    menu.classList.toggle('hidden');
}

function deleteFile(name) {
    if (confirm(`Are you sure you want to delete '${name}'?`)) {
        const filePath = state.currentPath === '/' ? '/' + name : state.currentPath + '/' + name;
        socket.emit('delete-file', filePath);
    }
}

function renameFile(name) {
    const newName = prompt('Enter new name:', name);
    if (newName && newName !== name) {
        const oldPath = state.currentPath === '/' ? '/' + name : state.currentPath + '/' + name;
        const newPath = state.currentPath === '/' ? '/' + newName : state.currentPath + '/' + newName;
        socket.emit('rename-file', { oldPath, newPath });
    }
}

function changePermissions(name) {
    const perms = prompt('Enter permissions (e.g., 755 or 644):', '644');
    if (perms) {
        const filePath = state.currentPath === '/' ? '/' + name : state.currentPath + '/' + name;
        const mode = parseInt(perms, 8);
        socket.emit('change-permissions', { path: filePath, mode });
    }
}

function showNewFileDialog() {
    const name = prompt('Enter file name:');
    if (name) {
        const filePath = state.currentPath === '/' ? '/' + name : state.currentPath + '/' + name;
        socket.emit('write-file', {
            path: filePath,
            content: ''
        });
    }
}

function showNewFolderDialog() {
    const name = prompt('Enter folder name:');
    if (name) {
        const folderPath = state.currentPath === '/' ? '/' + name : state.currentPath + '/' + name;
        socket.emit('create-directory', folderPath);
    }
}

function refreshFiles() {
    socket.emit('list-directory', state.currentPath);
}

// Close file menus on click outside
document.addEventListener('click', () => {
    document.querySelectorAll('[id^="file-menu-"]').forEach(menu => menu.classList.add('hidden'));
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

function showLoading(text) {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    const colors = {
        'success': 'bg-success/20 border-success/50 text-success',
        'error': 'bg-danger/20 border-danger/50 text-danger',
        'warning': 'bg-warning/20 border-warning/50 text-warning',
        'info': 'bg-primary/20 border-primary/50 text-primary'
    };

    toast.className = `px-4 py-3 rounded border ${colors[type]} text-sm font-medium shadow-lg animate-pulse`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ============================================
// UPLOAD FUNCTIONS
// ============================================

function showUploadDialog() {
    document.getElementById('upload-modal').classList.remove('hidden');
    document.getElementById('upload-remote-path').value = state.currentPath || '/';
    document.getElementById('upload-file-input').value = '';
    document.getElementById('upload-progress').classList.add('hidden');
}

function closeUploadDialog() {
    document.getElementById('upload-modal').classList.add('hidden');
}

async function executeUpload() {
    const fileInput = document.getElementById('upload-file-input');
    const remotePath = document.getElementById('upload-remote-path').value;

    if (!fileInput.files || fileInput.files.length === 0) {
        showToast('Please select a file to upload', 'warning');
        return;
    }

    const file = fileInput.files[0];
    const destPath = remotePath.endsWith('/')
        ? remotePath + file.name
        : remotePath + '/' + file.name;

    // Read file as base64
    const reader = new FileReader();
    reader.onload = function (e) {
        const base64Content = e.target.result.split(',')[1];

        // Show progress
        document.getElementById('upload-progress').classList.remove('hidden');
        document.getElementById('upload-progress-bar').style.width = '50%';
        document.getElementById('upload-progress-text').textContent = '50%';

        showLoading('Uploading file...');

        // Emit upload request
        socket.emit('upload-file', {
            localPath: file.name,
            remotePath: destPath,
            content: base64Content
        });

        document.getElementById('upload-progress-bar').style.width = '100%';
        document.getElementById('upload-progress-text').textContent = '100%';
    };
    reader.readAsDataURL(file);
}

// ============================================
// COMPRESS FUNCTIONS
// ============================================

function showCompressDialog(name, type) {
    const filePath = state.currentPath === '/' ? '/' + name : state.currentPath + '/' + name;

    document.getElementById('compress-modal').classList.remove('hidden');
    document.getElementById('compress-source-path').value = filePath;

    // Suggest archive name
    const defaultName = name + '.tar.gz';
    document.getElementById('compress-archive-name').value = defaultName;
}

function closeCompressDialog() {
    document.getElementById('compress-modal').classList.add('hidden');
}

function executeCompress() {
    const sourcePath = document.getElementById('compress-source-path').value;
    let archiveName = document.getElementById('compress-archive-name').value;
    const format = document.getElementById('compress-format').value;

    if (!archiveName) {
        showToast('Please enter an archive name', 'warning');
        return;
    }

    // Add extension if not provided
    const extMap = { 'tar.gz': '.tar.gz', 'zip': '.zip', 'tar.bz2': '.tar.bz2' };
    if (!archiveName.endsWith(extMap[format])) {
        archiveName += extMap[format];
    }

    showLoading('Compressing...');
    socket.emit('compress-archive', {
        sourcePath: sourcePath,
        archiveName: archiveName,
        format: format
    });
}

// ============================================
// EXTRACT FUNCTIONS
// ============================================

function showExtractDialog(name) {
    const filePath = state.currentPath === '/' ? '/' + name : state.currentPath + '/' + name;

    document.getElementById('extract-modal').classList.remove('hidden');
    document.getElementById('extract-archive-path').value = filePath;
    document.getElementById('extract-destination-path').value = '';
}

function closeExtractDialog() {
    document.getElementById('extract-modal').classList.add('hidden');
}

function executeExtract() {
    const archivePath = document.getElementById('extract-archive-path').value;
    const destinationPath = document.getElementById('extract-destination-path').value || null;

    showLoading('Extracting...');
    socket.emit('extract-archive', {
        archivePath: archivePath,
        destinationPath: destinationPath
    });
}

// ============================================
// SEARCH FUNCTIONS
// ============================================

function showSearchDialog() {
    document.getElementById('search-modal').classList.remove('hidden');
    document.getElementById('search-path').value = state.currentPath || '/';
    document.getElementById('search-pattern').focus();
    document.getElementById('search-results-container').classList.add('hidden');
    document.getElementById('search-empty').classList.remove('hidden');
}

function closeSearchDialog() {
    document.getElementById('search-modal').classList.add('hidden');
}

function executeSearch() {
    const searchPath = document.getElementById('search-path').value || '/';
    const pattern = document.getElementById('search-pattern').value.trim();
    const searchType = document.getElementById('search-type').value;

    if (!pattern) {
        showToast('Please enter a search pattern', 'warning');
        return;
    }

    // Show loading
    document.getElementById('search-empty').classList.add('hidden');
    document.getElementById('search-results-container').classList.add('hidden');
    document.getElementById('search-loading').classList.remove('hidden');

    // Emit search request
    socket.emit('search-files', {
        searchPath: searchPath,
        pattern: pattern,
        searchType: searchType
    });
}

function renderSearchResults(results) {
    const container = document.getElementById('search-results-list');
    const countElement = document.getElementById('search-results-count');

    if (!results || results.length === 0) {
        document.getElementById('search-loading').classList.add('hidden');
        document.getElementById('search-results-container').classList.add('hidden');
        document.getElementById('search-empty').classList.remove('hidden');
        document.getElementById('search-empty').innerHTML = `
            <div class="text-center text-text-muted">
                <span class="material-symbols-outlined text-4xl mb-2 opacity-50">search_off</span>
                <p class="text-sm">No results found</p>
            </div>
        `;
        return;
    }

    countElement.textContent = `${results.length} file${results.length > 1 ? 's' : ''} found`;

    container.innerHTML = results.map(file => {
        const icon = getFileIcon(file);
        const size = file.type === 'dir' ? '-' : formatFileSize(file.size);
        const modified = formatDate(file.modified);

        return `
            <div class="flex items-center gap-3 px-4 py-3 bg-surface hover:bg-surface-highlight border border-border-dark rounded group transition-all cursor-pointer" onclick="openSearchResult('${file.path}', '${file.type}')">
                <span class="material-symbols-outlined ${icon.color} text-[20px] shrink-0">${icon.name}</span>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="text-white text-sm font-medium truncate group-hover:text-primary">${file.name}</span>
                    </div>
                    <p class="text-[10px] text-text-muted font-mono truncate">${file.path}</p>
                </div>
                <div class="shrink-0 text-right">
                    <p class="text-[10px] text-text-muted">${size}</p>
                    <p class="text-[10px] text-text-muted">${modified}</p>
                </div>
                <button onclick="event.stopPropagation(); showSearchResultMenu('${file.path}')" class="opacity-0 group-hover:opacity-100 text-text-muted hover:text-white p-1 rounded hover:bg-white/10 transition-all">
                    <span class="material-symbols-outlined text-[18px]">more_vert</span>
                </button>
            </div>
        `;
    }).join('');

    document.getElementById('search-loading').classList.add('hidden');
    document.getElementById('search-results-container').classList.remove('hidden');
}

function openSearchResult(path, type) {
    closeSearchDialog();

    // Extract directory from path
    const lastSlash = path.lastIndexOf('/');
    const dir = path.substring(0, lastSlash) || '/';
    const filename = path.substring(lastSlash + 1);

    // Navigate to directory
    navigateToPath(dir);

    // If it's a file, open editor
    if (type === 'file') {
        setTimeout(() => {
            const files = state.currentFiles;
            const file = files.find(f => f.name === filename);
            if (file) {
                editFile(filename);
            }
        }, 500);
    }
}

function showSearchResultMenu(path) {
    const action = prompt('Choose action:\n1. Open\n2. Edit\n3. Download\n\nEnter number:');
    if (action === '1') {
        const lastSlash = path.lastIndexOf('/');
        const dir = path.substring(0, lastSlash) || '/';
        closeSearchDialog();
        navigateToPath(dir);
    } else if (action === '2') {
        const lastSlash = path.lastIndexOf('/');
        const dir = path.substring(0, lastSlash) || '/';
        const filename = path.substring(lastSlash + 1);
        closeSearchDialog();
        navigateToPath(dir);
        setTimeout(() => editFile(filename), 500);
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!document.getElementById('editor-modal').classList.contains('hidden')) {
            closeEditor();
        } else if (!document.getElementById('search-modal').classList.contains('hidden')) {
            closeSearchDialog();
        } else if (!document.getElementById('upload-modal').classList.contains('hidden')) {
            closeUploadDialog();
        } else if (!document.getElementById('compress-modal').classList.contains('hidden')) {
            closeCompressDialog();
        } else if (!document.getElementById('extract-modal').classList.contains('hidden')) {
            closeExtractDialog();
        }
    }
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (!document.getElementById('editor-modal').classList.contains('hidden')) {
            saveFile();
        }
    }
    if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        showSearchDialog();
    }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    const hostInput = document.getElementById('ssh-host');
    if (hostInput && !hostInput.value) {
        hostInput.focus();
    }
});
