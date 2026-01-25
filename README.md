# SSH Web Client

<div align="center">

![SSH Web Client](https://img.shields.io/badge/SSH-Web%20Client-00eeff?style=for-the-badge&logo=ssh)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-white?style=for-the-badge&logo=socket.io)
![License](https://img.shields.io/badge/License-CC--BY--NC--SA%204.0-red?style=for-the-badge)

**A modern web-based SSH client for remote server management**

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Tech Stack](#-tech-stack) • [License](#-license)

---

**Repository:** `https://github.com/Re-xist/SSH-Web-Client`

**Author:** [Re-xist](https://github.com/Re-xist)

</div>

---

## 📋 Description

**SSH Web Client** is a web-based application for managing SSH servers directly from your browser. Built with Node.js, Express, Socket.IO, and SSH2, it provides a complete terminal experience and file management capabilities without installing a local SSH client.

### Why SSH Web Client?

- ✅ **No SSH client installation needed** - Just open your browser
- ✅ **Access from anywhere** - Works with internet connection
- ✅ **Modern interface** - Easy to use with intuitive UI
- ✅ **Open Source** - Free for personal and educational use
- ✅ **Full-featured** - Terminal, file manager, upload, download, compress, extract

---

## ✨ Features

### Main Features
- 🚀 **Real SSH Connection** - Direct connection using SSH2 protocol
- 🖥️ **Interactive Terminal** - xterm.js based terminal with shell access
- 📁 **File Browser** - Navigate and manage remote filesystem
- ✏️ **File Editor** - Edit files directly in browser with CodeMirror
- 🔍 **Search** - Find files by name, content, or extension

### File Operations
| Feature | Description |
|---------|-------------|
| 📤 **Upload** | Upload files from your computer to server |
| 📥 **Download** | Download files from server to your computer |
| 📝 **Create/Edit** | Create new files and edit existing files |
| 🗑️ **Delete** | Delete files and directories |
| ✂️ **Rename** | Rename files and folders |
| 🔒 **Permissions** | Change file permissions (chmod) |
| 📦 **Compress** | Create archives (tar.gz, zip, tar.bz2) |
| 📂 **Extract** | Extract archives (zip, tar.gz, tar.bz2, tar, gz) |

### UI/UX
- 🌙 **Dark Mode** - Comfortable dark theme
- 📱 **Responsive** - Works on desktop and mobile
- ⌨️ **Keyboard Shortcuts** - Ctrl+S save, Ctrl+F find, ESC close modal
- 🎨 **Modern Design** - Clean and intuitive interface with Material Icons

---

## 📦 Installation

### Prerequisites
- Node.js 18 or higher
- npm or yarn

### Install Steps

#### 1. Clone Repository
```bash
git clone https://github.com/Re-xist/SSH-Web-Client.git
cd SSH-Web-Client
```

#### 2. Install Dependencies
```bash
npm install
```

#### 3. Run Application
```bash
npm start
```

Application will run at `http://localhost:2211`

### Docker Installation

#### Using docker-compose
```bash
docker-compose up -d
```

#### Using docker directly
```bash
docker build -t ssh-web-client .
docker run -d -p 2211:2211 --name ssh-web-client ssh-web-client
```

### Useful Commands

| Command | Description |
|---------|-------------|
| `npm start` | Run the application |
| `docker-compose up -d` | Run with Docker |
| `docker-compose down` | Stop container |
| `docker-compose logs -f` | View logs |
| `docker-compose restart` | Restart container |

---

## 🚀 Usage

### Step-by-Step Guide

1. **Open application** in browser at `http://localhost:2211`

2. **Enter SSH credentials:**
   - **Server Address** - IP or hostname of server
   - **Port** - Default: 22
   - **Username** - SSH username
   - **Password** - SSH password
   - **Initial Directory** (optional) - Starting directory

3. **Click "Connect to SSH Server"**

4. **Start managing remote server:**
   - Use file browser to navigate directories
   - Click files to edit
   - Use terminal for commands
   - Upload/download files as needed

### Keyboard Shortcuts

| Shortcut | Function |
|----------|----------|
| `Ctrl + S` | Save file (in editor) |
| `Ctrl + F` | Find files |
| `ESC` | Close modal |

---

## 🛠 Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js, Express |
| SSH Library | SSH2 |
| Real-time Communication | Socket.IO |
| Terminal | xterm.js |
| Code Editor | CodeMirror |
| Styling | Tailwind CSS |
| Icons | Material Symbols |

---

## 📸 Screenshots

### Login Page
```
┌─────────────────────────────────────┐
│         SSH Web Client              │
│    Real SSH Connection              │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Server Address              │   │
│  │ [192.168.1.100     ] [22]  │   │
│  │                             │   │
│  │ Username                    │   │
│  │ [root                 ]     │   │
│  │                             │   │
│  │ Password                    │   │
│  │ [••••••••             ]     │   │
│  │                             │   │
│  │ [  Connect to SSH Server  ] │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Main Dashboard
```
┌────────────────────────────────────────────────────────────┐
│ SSH Client    root@192.168.1.42:22  ● Connected        🔍 ⬇️ │
├────────────────────────────────────────────────────────────┤
│ Remote Filesystem                        [Upload] [File]    │
│ /var/www/html                                                │
├────────────────────────────────────────────────────────────┤
│ 📁 ..                                                      │
│ 📁 css                 drwxr-xr-x    2024-01-15           │
│ 📁 js                  drwxr-xr-x    2024-01-15           │
│ 📄 index.html          -rw-r--r--    2024-01-15    4.2KB │
│ 📄 style.css           -rw-r--r--    2024-01-15    2.1KB │
│ 📦 backup.tar.gz       -rw-r--r--    2024-01-14    15MB  │
├────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────┐ │
│ │ $ ssh-user@server:~$                                   │ │
│ │ █                                                      │ │
│ └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

---

## 🔒 Security Notice

This application makes direct SSH connections to your servers. Always ensure:
- Use strong passwords
- Run through HTTPS in production
- Keep the application updated
- Use firewall rules to restrict access
- Don't expose the application publicly without protection

---

## 🗺 Roadmap

- [ ] SSH key authentication support
- [ ] Multiple simultaneous connections
- [ ] File transfer progress indicator
- [ ] Dark/Light theme toggle
- [ ] Multi-language support
- [ ] SFTP file transfer mode
- [ ] Terminal session recording
- [ ] User authentication for web interface

---

## 🤝 Contributing

Contributions are welcome! Please submit Pull Requests.

1. Fork this repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## ⚠️ License

```
SSH WEB CLIENT - Copyright (c) 2025 Re-xist

This work is licensed under the Creative Commons
Attribution-NonCommercial-ShareAlike 4.0 International License.

You are free to:
- Share — copy and redistribute the material in any medium or format
- Adapt — remix, transform, and build upon the material

Under the following terms:
- Attribution — You must give appropriate credit, provide a link to the
  license, and indicate if changes were made.

- NonCommercial — You may not use the material for commercial purposes.
  **COMMERCIAL USE IS PROHIBITED**

- ShareAlike — If you remix, transform, or build upon the material, you must
  distribute your contributions under the same license.

This is a FREE and OPEN SOURCE project for:
✅ Personal use
✅ Educational purposes
✅ Non-commercial organizations
✅ Community projects

❌ COMMERCIAL USE IS PROHIBITED

For more information, visit:
https://creativecommons.org/licenses/by-nc-sa/4.0/
```

### License Explanation

This application is **FREE** and **OPEN SOURCE** under **CC-BY-NC-SA 4.0** license:

| ✅ Allowed | ❌ Prohibited |
|------------|--------------|
| Personal use | Reselling |
| Modify code | Commercial products |
| Free distribution | Remove author credit |
| Learning & education | Closed source modifications |

---

## 📞 Contact & Support

- **Author:** [Re-xist](https://github.com/Re-xist)
- **Repository:** https://github.com/Re-xist/SSH-Web-Client
- **Issues:** https://github.com/Re-xist/SSH-Web-Client/issues

---

<div align="center">

## ⭐ If helpful, give it a star! ⭐

**Made with ❤️ by [Re-xist](https://github.com/Re-xist)**

**FREE FOREVER - NOT FOR SALE**

`https://github.com/Re-xist/SSH-Web-Client`

</div>
