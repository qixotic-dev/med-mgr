# 🚀 Quick Start - 5 Minutes to Desktop App

## What You Get

✅ Full-featured Electron desktop app for Windows
✅ Google OAuth login (browser popup → app sign-in)
✅ Google Drive data sync (your account)
✅ Google Calendar reminders
✅ Automatic updates via GitHub
✅ Dark mode support
✅ Same UI as web version

---

## STEP 1️⃣: Prep (10 mins, one-time)

### Install Node.js
→ [Download here](https://nodejs.org/) (v16+)

### Get Your Google OAuth Secret
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select **"Medication Manager"** project
3. Credentials → your OAuth client
4. Copy the **Client Secret**
5. Create `.env` file in project folder:
```
GOOGLE_CLIENT_SECRET=your_secret_here
```

---

## STEP 2️⃣: Install & Run (5 mins)

```bash
# Download code
git clone https://github.com/qixotic-dev/med-manager-desktop.git
cd med-manager-desktop

# Install
npm install

# Run (with DevTools)
npm run dev
```

✅ App launches!
- Click "Sign in with Google"
- Browser opens → click "Allow"
- App reloads signed in

---

## STEP 3️⃣: Build & Test (5 mins)

```bash
# Create installer
npm run build:win
```

📁 Creates `dist/` folder with:
- `Rx Order Manager-1.0.0.exe` ← Send this to users
- `Rx Order Manager-1.0.0-portable.exe` ← No install needed

Test it:
1. Run the `.exe`
2. Complete wizard
3. Launch and test login

---

## STEP 4️⃣: Publish (Optional, 15 mins)

### Create GitHub Repo
1. New repo: `med-manager-desktop`
2. Make it **public**
3. Add Secret:
   - Settings → Secrets → `GOOGLE_CLIENT_SECRET`
   - Paste your OAuth secret

### Push & Release
```bash
# First time only
git remote add origin https://github.com/qixotic-dev/med-manager-desktop
git branch -M main
git push -u origin main

# Then for releases:
git tag v1.0.0
git push origin v1.0.0
```

✅ GitHub Actions auto-builds!
✅ Release published with `.exe` files
✅ Users auto-update when you tag new versions

---

## Common Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Run app with DevTools for development |
| `npm run build:win` | Build Windows installer (.exe) |
| `npm start` | Run built app (production mode) |
| `npm run pack` | Just package (no installer) |
| `git tag v1.0.1` | Create release (GitHub Actions builds) |
| `git push origin v1.0.1` | Publish release |

---

## File Overview

```
med-manager-desktop/
├── main.js          ← Electron background process
├── preload.js       ← Secure messenger (UI ↔ Main)
├── index.html       ← Your UI (same as web version)
├── package.json     ← Dependencies & build config
├── SETUP.md         ← Detailed setup guide
├── DEPLOYMENT.md    ← Full release workflow
└── dist/            ← Build output (created by npm run build:win)
```

---

## How It Works

```
User clicks "Sign in"
    ↓
App opens browser to Google
    ↓
User clicks "Allow"
    ↓
Browser redirects to http://localhost:3000
    ↓
App catches redirect, gets access token
    ↓
App stores token securely
    ↓
App loads data from Google Drive
    ↓
User sees medication list
```

---

## Data Flow

```
App UI (index.html)
    ↓ IPC messages
Main Process (main.js)
    ├→ Google OAuth
    ├→ Google Drive API (read/write data)
    ├→ Google Calendar API (add reminders)
    └→ electron-store (save credentials)
```

**Your data stays in your Google account!** ✨

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Can't sign in" | Check popup blocker, test in dev mode |
| "Drive access denied" | Verify OAuth scope includes `drive` |
| "Build fails" | `rm -rf node_modules && npm install` |
| "App crashes" | DevTools (F12) → Console tab → errors |

---

## Next Steps

1. ✅ Install Node.js
2. ✅ Set `GOOGLE_CLIENT_SECRET` in `.env`
3. ✅ Run `npm install && npm run dev`
4. ✅ Test sign-in flow
5. ✅ Build with `npm run build:win`
6. ✅ (Optional) Push to GitHub, tag release
7. ✅ Done! Share `.exe` file with users

---

## Want More Details?

- 🔧 **Development?** → Read `SETUP.md`
- 🚀 **Deploy & Release?** → Read `DEPLOYMENT.md`
- 📖 **Full guide?** → Read `README.md`

---

**Everything ready? Try it:**
```bash
npm install && npm run dev
```

Click "Sign in with Google" → profit! 🎉

---

**Questions?** Check `SETUP.md` troubleshooting or GitHub Docs on Electron.
