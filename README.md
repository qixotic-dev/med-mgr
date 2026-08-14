# Rx Order Manager - Windows Desktop App

A desktop application for tracking prescription orders, pharmacy information, prescriber details, and scheduling reminders.

## Features

✨ **Core Functionality**
- Track medications by category (Cardiac, Oncology, Mental, Urologic, GI, Respiratory, Dental, Bone Health)
- Store pharmacy name, phone, and address
- Store prescriber name and phone
- Record ordering instructions and scheduling notes
- Track last order date and schedule next order
- Dark mode support

🔐 **Cloud Integration**
- **Google OAuth** authentication via desktop OAuth flow
- **Google Drive** for secure data persistence
- **Google Calendar** for order reminders (24-hour notice)
- Auto-refresh access tokens

🚀 **Desktop Experience**
- Native Windows application (.exe installer)
- Automatic updates via GitHub releases
- Offline access (cached data)
- System tray integration (future)
- Cross-platform ready (Windows priority, macOS/Linux compatible)

## Quick Start

### Requirements
- Windows 7 or later
- Internet connection (for Google sign-in)

### Installation

1. **Download** the latest installer:
   - Go to [GitHub Releases](https://github.com/qixotic-dev/med-manager-desktop/releases)
   - Download `Rx Order Manager-X.X.X.exe`

2. **Install**:
   - Run the `.exe` file
   - Follow the installer wizard
   - Accept desktop/start menu shortcuts

3. **Launch**:
   - Open from Start Menu or Desktop shortcut
   - Click "Sign in with Google"
   - Authorize access to Google Drive and Calendar

### Usage

1. **Select a medication** from the left sidebar
2. **Fill in pharmacy details**:
   - Pharmacy name & phone (required)
   - Prescriber name & phone (required)
   - Address and ordering instructions (optional)
3. **Schedule next order**:
   - Click "Pick date"
   - Select a date on the calendar
   - Will auto-add reminder to Google Calendar
4. **Save** - Button enables once all required fields are filled

## Development

For developers who want to build from source:

### Setup
```bash
git clone https://github.com/qixotic-dev/med-manager-desktop.git
cd med-manager-desktop
npm install
```

### Development Mode
```bash
npm run dev
```
Launches the app with DevTools for debugging.

### Build
```bash
npm run build:win
```
Creates installer in `dist/` directory.

See [SETUP.md](SETUP.md) for detailed development and deployment instructions.

## Architecture

```
Renderer (index.html)
    ↓
IPC (preload.js - secure bridge)
    ↓
Main Process (main.js)
    ├─→ OAuth Server (port 3000)
    ├─→ Google Drive API (data)
    ├─→ Google Calendar API (reminders)
    └─→ electron-store (secure storage)
```

- **Preload.js**: Restricted API for UI ↔ Main communication
- **Main.js**: Window management, OAuth, API calls
- **index.html**: Pure HTML/CSS/JS UI (no external frameworks)
- **electron-store**: Encrypted credential storage

## Data Storage

- **Access tokens**: Stored securely in electron-store (OS credential manager on Windows)
- **Medication orders**: JSON on Google Drive (`richard_medication_orders.json`)
- **UI preferences**: localStorage (dark mode, tree open/close state)
- **Calendar reminders**: Google Calendar

## Updates

The app checks for updates every hour:
- If new version is available, user is notified
- Can choose to "Install" or "Later"
- Updates downloaded and installed in background
- App restarts to apply update

Updates are published to GitHub Releases when new versions are tagged.

## Troubleshooting

**Can't sign in?**
- Check internet connection
- Verify pop-up blocker isn't blocking auth window
- Try signing out and back in

**Data not syncing?**
- Check Google Drive access
- Verify authorized with test user account
- Click save after making changes

**Auto-update not working?**
- Ensure you have internet access
- Check app version (View menu)
- Manual updates available on GitHub Releases

## Security & Privacy

🔒 **Authentication**
- OAuth 2.0 via Google
- No passwords stored locally
- Refresh tokens for offline access

🔐 **Data**
- All data stored on Google Drive (your account)
- Credentials secured in OS credential manager
- IPC communication sandboxed

## Support

For issues or feature requests:
1. Check [GitHub Issues](https://github.com/qixotic-dev/med-manager-desktop/issues)
2. Review [SETUP.md](SETUP.md) troubleshooting section
3. Contact developer via GitHub

## License

MIT License - see LICENSE file

---

**Made with ❤️ for tracking medications easily**

Built with Electron | Google Cloud | Node.js
