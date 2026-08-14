# Rx Order Manager - Desktop App Setup Guide

This guide walks you through setting up the Electron desktop application for Windows, including Google OAuth configuration, local development, and distribution.

## Prerequisites

- **Node.js** (v16 or later) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** - [Download here](https://git-scm.com/)
- **Google Cloud Project** - Already set up at "Medication Manager"
- **GitHub account** - For hosting releases

## Step 1: Google Cloud Console Setup

### 1.1 Create OAuth Credentials for Desktop

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select the **"Medication Manager"** project
3. Navigate to **APIs & Services** → **Credentials**
4. Click **+ Create Credentials** → **OAuth client ID**
5. Choose **Desktop application**
6. Name it "Rx Order Manager - Desktop"
7. Click **Create**

### 1.2 Add Redirect URIs

1. In Credentials, click on your new OAuth client
2. Under **Authorized redirect URIs**, click **Add URI**
3. Add: `http://localhost:3000/auth/callback`
4. Save

### 1.3 Copy Your Client Secret

1. Click on the OAuth client to open details
2. Copy the **Client ID** (already in code: `972705955264-1r2bivpb0ece9bvvs8vbe0tuklru9761.apps.googleusercontent.com`)
3. Copy the **Client Secret**
4. **Keep this secret!** Do not commit it to git.

### 1.4 Enable Required APIs

Make sure these are enabled in **APIs & Services** → **Enabled APIs & Services**:
- ✅ Google Drive API
- ✅ Google Calendar API

## Step 2: Local Development Setup

### 2.1 Clone and Install

```bash
git clone https://github.com/qixotic-dev/med-manager-desktop.git
cd med-manager-desktop
npm install
```

### 2.2 Set Environment Variables

Create a `.env` file in the project root:

```env
GOOGLE_CLIENT_SECRET=your_client_secret_here
NODE_ENV=development
```

**Important:** Add `.env` to `.gitignore` to prevent committing secrets.

### 2.3 Run Development Mode

```bash
npm run dev
```

This launches:
- The Electron app with DevTools open
- Hot reload for debugging
- Console output for errors

## Step 3: Building for Distribution

### 3.1 Build Windows Installer

```bash
npm run build:win
```

Output files will be in `dist/`:
- `Rx Order Manager-1.0.0.exe` - NSIS installer
- `Rx Order Manager-1.0.0-portable.exe` - Standalone portable version
- `latest.yml` - Update manifest (auto-updater)

### 3.2 Test the Installer

1. Run the `.exe` file
2. Follow installation wizard
3. App should launch with login screen
4. Click **Sign in with Google**
5. Your default browser opens → authorize access
6. App closes and reopens signed in

## Step 4: Auto-Update Configuration

### 4.1 GitHub Repository Setup

1. Create a new GitHub repository: `qixotic-dev/med-manager-desktop`
2. Make it **public** (required for auto-updates)
3. Push the code:

```bash
git remote add origin https://github.com/qixotic-dev/med-manager-desktop.git
git branch -M main
git push -u origin main
```

### 4.2 Add GitHub Secrets

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add new secret `GOOGLE_CLIENT_SECRET` with your OAuth secret

### 4.3 Create Release for Auto-Update

When you're ready to release a new version:

```bash
# Update version in package.json
npm version patch  # or minor, major

# Create a git tag
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions will automatically:
1. Build the Windows installer
2. Create a GitHub Release
3. Upload `.exe` files and `latest.yml`
4. Your app can now auto-update to v1.0.1

## Step 5: Distribution to Users

### Option A: Direct Download
1. Go to [GitHub Releases](https://github.com/qixotic-dev/med-manager-desktop/releases)
2. Download latest `Rx Order Manager-X.X.X.exe`
3. Run installer

### Option B: Auto-Update
Once published to GitHub, users who have the app will receive updates automatically within 1 hour.

To check for updates manually in the app:
- Click menu → View → DevTools to see update logs
- Or add a "Check for Updates" menu item (future enhancement)

## Troubleshooting

### OAuth Not Working
- ✅ Check `http://localhost:3000/auth/callback` is in Google Cloud Console
- ✅ Verify `GOOGLE_CLIENT_SECRET` is correct
- ✅ Browser popup blocker might prevent auth window
- Check DevTools (Ctrl+Shift+I) for errors

### Drive API Permission Denied
- ✅ Ensure Google Drive API is enabled in Cloud Console
- ✅ Ask user to re-authenticate by clicking Sign out → Sign in
- ✅ Verify the test user `richard.haber@gmail.com` has access

### Auto-Update Not Working
- ✅ App must be version 1.0.1+ to detect updates
- ✅ `latest.yml` must be in GitHub Release assets
- ✅ Check internet connection

### Build Fails
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again
- Run `npm run build:win`

## File Structure

```
med-manager-desktop/
├── main.js                 # Electron main process
├── preload.js              # Secure renderer bridge
├── index.html              # UI (same as web version)
├── package.json            # Dependencies & scripts
├── electron-builder.json   # Build configuration
├── SETUP.md               # This file
├── .github/
│   └── workflows/
│       └── release.yml    # GitHub Actions CI/CD
└── dist/                  # Build output (created by npm run build)
```

## Key Technologies

- **Electron** - Desktop framework
- **electron-store** - Secure credential storage
- **electron-updater** - Auto-update system
- **electron-builder** - Windows installer builder
- **Google Identity** - OAuth 2.0 flow
- **Google Drive API** - Data persistence
- **Google Calendar API** - Reminder scheduling

## Security Notes

1. **Client Secret**: Never commit `.env` or expose in source
2. **Access Tokens**: Stored in electron-store (OS credential manager)
3. **IPC**: Renderer ↔ Main communication is sandboxed
4. **OAuth**: Uses `offline` scope for refresh tokens
5. **Auto-updates**: Signed by electron-builder (unsigned for now, can add code signing)

## Next Steps

1. Set up Google Cloud OAuth client secret
2. Install Node.js and npm
3. Run `npm install && npm run dev` to test
4. Build with `npm run build:win`
5. Set up GitHub repo and Secrets
6. Tag version with `git tag v1.0.0 && git push origin v1.0.0`
7. Test auto-update by bumping to v1.0.1

Need help? Check the [Electron documentation](https://www.electronjs.org/docs) or [electron-builder guide](https://www.electron.build/).
