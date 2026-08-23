# Deployment & Release Guide

Complete walkthrough for building, testing, and distributing the Rx Order Manager desktop app.

## Phase 1: Pre-Release Checklist

### Code & Version
- [ ] Update `package.json` version (e.g., `1.0.0` → `1.0.1`)
- [ ] Update any docs referencing version
- [ ] Test all features in dev mode: `npm run dev`
- [ ] No console errors (Ctrl+Shift+I in app)

### GitHub Setup (One-time)
- [ ] Repository created: `qixotic-dev/med-manager-desktop`
- [ ] Repository is **public**
- [ ] `.github/workflows/release.yml` is in place
- [ ] GitHub Secret `GOOGLE_CLIENT_SECRET` is set

To set GitHub Secret:
1. Go to repo Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `GOOGLE_CLIENT_SECRET`
4. Value: (your OAuth client secret from Google Cloud)
5. Click "Add secret"

### Google Cloud
- [ ] OAuth client secret is ready
- [ ] Redirect URI: `http://localhost:3000/auth/callback` is configured
- [ ] Google Drive API enabled
- [ ] Google Calendar API enabled
- [ ] Test user account has access (e.g., your internal test Google account)

## Phase 2: Local Build & Test

### 2.1 Build Windows Installer

```bash
npm run build:win
```

Expected output:
```
dist/
├── Rx Order Manager-1.0.1.exe      (NSIS installer)
├── Rx Order Manager-1.0.1-portable.exe
└── latest.yml                       (auto-update manifest)
```

### 2.2 Test Installer

**On Windows machine:**

1. Uninstall any previous version
2. Run `dist/Rx Order Manager-1.0.1.exe`
3. Complete installation wizard
4. Launch from Start Menu or Desktop
5. Test login flow:
   - Click "Sign in with Google"
   - Default browser opens → authorize
   - App should reload signed in
6. Test core features:
   - Select medication
   - Fill required fields
   - Click Save
   - Verify data persists after close/reopen
   - Try dark mode toggle
7. Uninstall to verify clean removal

### 2.3 Test Portable Version

1. Run `dist/Rx Order Manager-1.0.1-portable.exe`
2. App launches directly (no install)
3. Verify it works the same as installed version

## Phase 3: Publish to GitHub

### 3.1 Commit Code

```bash
git add .
git commit -m "Release v1.0.1"
```

### 3.2 Create Git Tag

```bash
# Create lightweight tag
git tag v1.0.1

# Or annotated tag (recommended)
git tag -a v1.0.1 -m "Release v1.0.1 - bug fixes"

# Push tag to GitHub
git push origin v1.0.1
```

**This triggers GitHub Actions!**

### 3.3 Watch GitHub Actions

1. Go to repository
2. Click "Actions" tab
3. Find "Build and Release" workflow
4. Watch it build:
   - Install dependencies
   - Build Windows installer
   - Create GitHub Release
   - Upload `.exe` files and `latest.yml`

Wait for ✅ success (usually 5-10 minutes)

### 3.4 Verify Release

1. Go to [Releases](https://github.com/qixotic-dev/med-manager-desktop/releases)
2. Should see new release v1.0.1 with:
   - `.exe` files
   - `.yml` file (auto-update manifest)
   - Release notes (auto-generated)

## Phase 4: Update Auto-Update URL

The `latest.yml` file tells the app where to download updates. It should look like:

```yaml
version: 1.0.1
files:
  - url: Rx Order Manager-1.0.1.exe
    sha512: abc123...
    size: 156000000
path: https://github.com/qixotic-dev/med-manager-desktop/releases/download/v1.0.1/Rx Order Manager-1.0.1.exe
sha512: abc123...
releaseDate: '2024-01-15T12:00:00.000Z'
```

This is automatically generated and uploaded by GitHub Actions. No action needed!

## Phase 5: User Updates

### Auto-Update Flow

1. User has v1.0.0 installed
2. App checks for updates every 60 minutes
3. Finds v1.0.1 available
4. Dialog: "New version available. Install now?"
5. User clicks "Install"
6. Download happens in background
7. Dialog: "Update installed. Restart now?"
8. Click "Restart" or close app
9. v1.0.1 launches

### Manual Update Flow

1. User goes to [GitHub Releases](https://github.com/qixotic-dev/med-manager-desktop/releases)
2. Downloads latest `Rx Order Manager-X.X.X.exe`
3. Uninstalls old version
4. Installs new version

## Phase 6: Release Notes & Communication

### GitHub Release Notes

After build completes:

1. Go to Releases page
2. Click on v1.0.1 draft
3. Click "Edit"
4. Add description:

```markdown
# v1.0.1 - Bug Fixes & Improvements

## Fixed
- Fixed Google Drive sync timeout
- Improved calendar date picker
- Dark mode toggle now persists

## Added
- Support for medication notes
- Auto-retry failed saves

## Changed
- Updated Google API libraries
- Improved error messages

## Download
- Windows installer: Rx Order Manager-1.0.1.exe
- Portable (no install): Rx Order Manager-1.0.1-portable.exe

See [changelog](CHANGELOG.md) for details.
```

5. Click "Publish release"

### Communicate with Users

If needed, notify users through:
- Email: Include GitHub Releases link
- Slack: "New version available"
- In-app: Add notification banner (future enhancement)

## Phase 7: Rollback (If Needed)

If v1.0.1 has critical bugs:

### Option A: Immediate Patch
```bash
# Fix bugs locally
npm run dev  # Test

# Update version to 1.0.2
npm run build:win
git tag v1.0.2
git push origin v1.0.2
```

### Option B: Revert Version
```bash
# Delete problematic tag
git tag -d v1.0.1
git push origin :refs/tags/v1.0.1

# App auto-updater will show last valid version
```

## Troubleshooting Deployment

### Build Failed
```bash
# Clean and retry
rm -rf node_modules dist
npm install
npm run build:win
```

### Latest.yml Not Generated
- Check GitHub Actions completed successfully
- Verify `.yml` files in Release assets
- Re-run workflow if needed

### Auto-Update Not Triggering
1. Verify `latest.yml` is in Release assets
2. Restart app to force update check
3. Check `%APPDATA%\Rx Order Manager` for electron-updater logs

### Users Stuck on Old Version
1. Download portable version from Releases
2. Uninstall old version
3. Run portable version
4. Future updates will work normally

## Automated Release Workflow

After initial setup, releases are automatic:

```
✏️ Code change
    ↓
🔧 npm version patch (bumps version, creates tag)
    ↓
🚀 git push origin vX.X.X (push tag)
    ↓
⚙️ GitHub Actions builds
    ↓
📦 Release published
    ↓
📥 Users auto-update
```

## Monthly Maintenance

**First Monday of each month:**
1. Check GitHub Security alerts
2. Run `npm outdated` - check for updates
3. Test latest Electron version
4. If updates needed: bump, build, release

## Monitoring

**Track app usage & crashes:**
1. Enable analytics in main.js (optional)
2. Monitor GitHub Release download stats
3. Watch for Issues reported on GitHub
4. Test on clean Windows install monthly

## Complete Checklist

**Before First Release (v1.0.0):**
- [ ] Google Cloud OAuth client secret ready
- [ ] GitHub repo created and public
- [ ] GitHub Secret configured
- [ ] Code committed to main branch
- [ ] Local build tested on Windows
- [ ] GitHub Actions workflow runs successfully
- [ ] Release published with .exe files

**Before Each Release (v1.0.1+):**
- [ ] Code changes tested in dev mode
- [ ] Version bumped in package.json
- [ ] Local build tested on Windows
- [ ] Tag created and pushed
- [ ] GitHub Actions completes
- [ ] Release published with changelog

---

**Time estimates:**
- First setup: 30 minutes
- Build & test: 15 minutes
- GitHub publish: 10 minutes (auto)
- Total per release: ~25 minutes

**Next release:** Update version, tag, push. Automation handles the rest! 🚀
