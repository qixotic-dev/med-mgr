# Rx Order Manager - Windows Desktop App
## Complete Electron Project Overview

---

## 📦 What's Included

I've created a **complete, production-ready Electron desktop application** for Windows with:

✅ **Full-featured desktop UI** - Same as your web version, optimized for desktop
✅ **Desktop OAuth flow** - Google sign-in with browser popup
✅ **Google Drive integration** - Cloud data persistence
✅ **Google Calendar API** - Automatic reminder scheduling
✅ **Auto-updates** - GitHub-based update system (one-click for users)
✅ **Dark mode** - Full theme support with persistence
✅ **Windows installer** - Professional `.exe` with uninstall
✅ **Security** - Electron sandboxing, secure credential storage, IPC isolation
✅ **CI/CD ready** - GitHub Actions for automated builds and releases

---

## 🗂️ Project Structure

```
med-manager-desktop/
├── 📄 README.md                    ← Start here (user-facing)
├── 📄 QUICK_START.md              ← 5-minute setup guide
├── 📄 SETUP.md                    ← Detailed dev environment setup
├── 📄 DEPLOYMENT.md               ← Complete release workflow
├── 📄 .gitignore                  ← Prevent committing secrets
│
├── 🔧 CORE APPLICATION FILES
│   ├── main.js                    ← Electron main process
│   ├── preload.js                 ← Secure IPC bridge
│   ├── index.html                 ← Your UI (desktop version)
│   ├── package.json               ← Dependencies & build scripts
│   └── electron-builder.json      ← Build configuration
│
├── 🔄 GITHUB AUTOMATION
│   └── .github/workflows/
│       └── release.yml            ← CI/CD for auto-builds
│
└── 📁 dist/                       ← Build output (created by npm run build:win)
    ├── *.exe                      ← Installers
    └── latest.yml                 ← Auto-update manifest
```

---

## 🚀 Quick Start (5 Minutes)

### 1. Prerequisites
- **Node.js** v16+ ([Download](https://nodejs.org/))
- **Google OAuth Client Secret** from Google Cloud Console
- **Windows** (for building/testing)

### 2. Setup
```bash
cd med-manager-desktop
npm install
```

### 3. Create `.env` file
```env
GOOGLE_CLIENT_SECRET=your_oauth_secret_here
NODE_ENV=development
```

### 4. Run Development
```bash
npm run dev
```

### 5. Build Installer
```bash
npm run build:win
```

📁 Creates `dist/Rx Order Manager-1.0.0.exe`

---

## 🔐 Authentication Flow

### Desktop OAuth (not browser-based)

```
1. User clicks "Sign in with Google"
       ↓
2. App starts local HTTP server (port 3000)
       ↓
3. User's default browser opens Google OAuth consent
       ↓
4. User clicks "Allow"
       ↓
5. Browser redirects to http://localhost:3000/auth/callback?code=...
       ↓
6. App intercepts, exchanges code for access token
       ↓
7. Token stored securely in electron-store
       ↓
8. App loads data from Google Drive
       ↓
9. User sees medication list
```

**Why this approach?**
- ✅ Works in desktop environment (no browser credentials)
- ✅ Secure token storage in OS credential manager
- ✅ Refresh tokens for offline access
- ✅ Better UX than copy/paste codes

---

## 📊 Data Architecture

### Data Flow
```
UI (index.html)
    ↓ [IPC Messages via preload.js]
Main Process (main.js)
    ├→ OAuth Server (Google sign-in)
    ├→ Google Drive API (read/write `richard_medication_orders.json`)
    ├→ Google Calendar API (create reminders)
    └→ electron-store (store access tokens securely)
```

### Storage Locations
- **Google Drive**: `richard_medication_orders.json` (stored in the signed-in user's Drive)
- **electron-store**: Credentials (Windows credential manager)
- **localStorage**: UI state (dark mode, tree open/close)

---

## ⚙️ Key Technologies

| Technology | Purpose |
|-----------|---------|
| **Electron** | Desktop framework (cross-platform) |
| **electron-builder** | Windows installer (.exe) & build config |
| **electron-updater** | Auto-update system via GitHub releases |
| **electron-store** | Secure credential storage |
| **Google OAuth 2.0** | Desktop authentication |
| **Google Drive API** | Data persistence |
| **Google Calendar API** | Reminder scheduling |
| **Node.js/npm** | Runtime & package management |

---

## 📝 File Guide

### Configuration Files

**`package.json`**
- Declares dependencies (Electron, electron-builder, etc.)
- Defines npm scripts (`npm run dev`, `npm run build:win`)
- Specifies build configuration

**`electron-builder.json`**
- Windows installer settings (NSIS)
- Output format (`.exe`, portable)
- Auto-update provider (GitHub)
- App metadata (name, version, etc.)

**`.gitignore`**
- Prevents committing `node_modules`, `dist/`, `.env`
- Keeps secrets safe

### Application Code

**`main.js`** - Electron Main Process
- Window creation & management
- OAuth server on port 3000
- Google API calls (Drive, Calendar)
- Auto-update configuration
- IPC handlers

**`preload.js`** - Secure IPC Bridge
- Exposes limited API to renderer
- No direct Node.js access from UI
- Sandboxing maintains security

**`index.html`** - User Interface
- Your existing web UI (no changes needed)
- Enhanced with Electron API calls
- Google OAuth flow for desktop
- Same look/feel as web version

### Documentation

**`README.md`** - End-user guide
- Features & quick start
- Installation instructions
- Troubleshooting

**`QUICK_START.md`** - 5-minute setup
- Bare minimum to get running
- Essential commands
- Common issues

**`SETUP.md`** - Developer setup
- Detailed environment configuration
- Google Cloud Console walkthrough
- Local development workflow
- Build instructions
- Testing procedures

**`DEPLOYMENT.md`** - Release process
- Step-by-step publishing guide
- GitHub setup
- GitHub Actions workflow
- Auto-update configuration
- Rollback procedures

### GitHub Automation

**`.github/workflows/release.yml`**
- Triggered on git tag push
- Builds Windows installer
- Creates GitHub Release
- Uploads `.exe` files
- Generates `latest.yml` for auto-updates

---

## 🔄 Build & Distribution Workflow

### Development
```bash
npm run dev                # Run with DevTools
```

### Production Build
```bash
npm run build:win         # Create .exe installer
```

### Release (GitHub)
```bash
git tag v1.0.1           # Create version tag
git push origin v1.0.1   # Push tag → triggers GitHub Actions
                         # → auto-builds → publishes release
```

### User Gets Update
- Auto-updater checks hourly
- Finds new version on GitHub
- Downloads `.exe` in background
- Notifies user: "Install now?"
- App restarts with new version

---

## 🔑 Key Features

### ✨ Core Functionality
- ✅ Track medications by category
- ✅ Store pharmacy & prescriber details
- ✅ Schedule next order dates
- ✅ Add ordering instructions
- ✅ Record last order date
- ✅ Google Calendar reminders (24-hour notice)

### 🖥️ Desktop Experience
- ✅ Native Windows UI
- ✅ Start menu integration
- ✅ Dark mode
- ✅ Offline access (cached data)
- ✅ Automatic updates
- ✅ Professional installer

### 🔒 Security
- ✅ OAuth 2.0 authentication
- ✅ Electron sandboxing
- ✅ Secure credential storage
- ✅ IPC isolation
- ✅ No passwords stored
- ✅ Data in your Google account

### 🌐 Cloud Integration
- ✅ Google Drive sync
- ✅ Google Calendar reminders
- ✅ Automatic token refresh
- ✅ Offline sync on reconnect

---

## 📋 Setup Checklist

### Phase 1: Google Cloud Console (10 mins)
- [ ] Create OAuth Desktop client
- [ ] Copy Client ID & Secret
- [ ] Add redirect URI: `http://localhost:3000/auth/callback`
- [ ] Enable Google Drive API
- [ ] Enable Google Calendar API
- [ ] Verify test user has access

### Phase 2: Local Development (5 mins)
- [ ] Install Node.js
- [ ] Download/clone project
- [ ] Create `.env` with `GOOGLE_CLIENT_SECRET`
- [ ] Run `npm install`
- [ ] Test with `npm run dev`

### Phase 3: Build & Test (10 mins)
- [ ] Run `npm run build:win`
- [ ] Install `.exe` on Windows machine
- [ ] Test login, save, dark mode
- [ ] Uninstall to verify clean removal

### Phase 4: GitHub Setup (Optional, 10 mins)
- [ ] Create repo `qixotic-dev/med-manager-desktop`
- [ ] Make repo **public**
- [ ] Add GitHub Secret `GOOGLE_CLIENT_SECRET`
- [ ] Commit code, push to main

### Phase 5: Release (5 mins each time)
- [ ] Bump version in `package.json`
- [ ] Create git tag: `git tag v1.0.0`
- [ ] Push tag: `git push origin v1.0.0`
- [ ] GitHub Actions auto-builds & publishes
- [ ] Release available on GitHub

---

## 🛠️ Common Development Tasks

### Run app in development
```bash
npm run dev
```

### Build installer for testing
```bash
npm run build:win
```

### Start fresh (clean cache)
```bash
rm -rf node_modules package-lock.json dist
npm install
npm run build:win
```

### Debug OAuth issues
1. Run `npm run dev`
2. Press F12 to open DevTools
3. Click "Sign in" and check Console tab for errors
4. Check OAuth server output in terminal

### Check version
- In app: View menu (if available)
- In code: See `package.json` "version" field
- In built exe: Right-click → Properties → Details

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue: "Can't sign in"**
- Solution: Check popup blocker
- Test in dev mode: `npm run dev`
- Verify `.env` has correct secret

**Issue: "Build fails"**
- Solution: `rm -rf node_modules && npm install`
- Check Node version: `node --version` (should be v16+)

**Issue: "Drive API error"**
- Solution: Ensure API is enabled in Google Cloud Console
- Verify test user email is correct

**Issue: "Auto-update not working"**
- Solution: Check app version (should be 1.0.1+)
- Verify `latest.yml` in GitHub Release
- Check internet connection

See `SETUP.md` for detailed troubleshooting.

---

## 📚 Documentation Map

| Document | For Whom | Read Time |
|----------|----------|-----------|
| `README.md` | End-users, general info | 5 min |
| `QUICK_START.md` | Developers, first time | 10 min |
| `SETUP.md` | Dev setup & troubleshooting | 20 min |
| `DEPLOYMENT.md` | Release process, CI/CD | 15 min |
| This file | Project overview | 10 min |

---

## ✅ What's Ready

- ✅ Full Electron app with desktop OAuth
- ✅ Google Drive API integration
- ✅ Google Calendar reminders
- ✅ Auto-update system (GitHub-based)
- ✅ Windows installer builder
- ✅ Dark mode support
- ✅ GitHub Actions CI/CD
- ✅ Security best practices
- ✅ Comprehensive documentation

## 🚀 What's Next

1. **Install Node.js** if not already done
2. **Read `QUICK_START.md`** for 5-minute setup
3. **Follow `SETUP.md`** for Google Cloud configuration
4. **Run `npm run dev`** to test locally
5. **Build with `npm run build:win`** to create `.exe`
6. **Follow `DEPLOYMENT.md`** to publish on GitHub

---

## 📦 Deliverables

All files are in `/mnt/user-data/outputs/med-manager-desktop/`

Ready to:
- ✅ Run locally in dev mode
- ✅ Build Windows installer
- ✅ Deploy to GitHub
- ✅ Enable auto-updates for users
- ✅ Maintain & update ongoing

---

## 💡 Architecture Highlights

### Why This Approach?

**Electron** vs alternatives:
- ✅ Reuse existing HTML/CSS/JS
- ✅ Native Windows experience
- ✅ Easy to build & distribute
- ✅ Powerful auto-update system
- ✅ Cross-platform capable (macOS, Linux later)

**Desktop OAuth** vs web:
- ✅ Better UX (no copy/paste)
- ✅ Secure token handling
- ✅ Works offline
- ✅ Refresh tokens for persistence

**GitHub Releases** for updates:
- ✅ Free hosting
- ✅ Automatic builds (GitHub Actions)
- ✅ One-click publishing
- ✅ Built-in rollback capability

---

## 🎯 Success Criteria

You'll know it's working when:

1. ✅ `npm run dev` launches app with DevTools
2. ✅ "Sign in with Google" opens browser
3. ✅ After auth, app shows medication list
4. ✅ Dark mode toggle persists
5. ✅ `npm run build:win` creates `.exe` installer
6. ✅ Running `.exe` installs app properly
7. ✅ App sign-in works after installation
8. ✅ GitHub repo tagged with version auto-builds (optional)

---

## 🎓 Learning Resources

- [Electron Docs](https://www.electronjs.org/docs)
- [electron-builder](https://www.electron.build/)
- [electron-updater](https://github.com/electron-userland/electron-builder/wiki/Auto-Update)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Google Drive API](https://developers.google.com/drive)
- [Google Calendar API](https://developers.google.com/calendar)

---

**Your complete Windows desktop app is ready to build, test, and share! 🚀**

Start with `QUICK_START.md` → `SETUP.md` → `npm run dev`

Questions? Check the docs or review the code comments in `main.js` and `preload.js`.
