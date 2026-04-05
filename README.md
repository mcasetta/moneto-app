# Moneto

**Il tuo bilancio di casa** — Windows desktop app for [Home Budget Tracker](https://github.com/mcasetta/home-budget-tracker).

Moneto is an Electron wrapper that packages the Home Budget Tracker Spring Boot backend and Angular frontend into a standalone Windows installer. No Java, no browser, no server setup required.

## Architecture

```
Moneto (Electron)
├── Launches Spring Boot JAR as a child process
├── Opens a native window (BrowserWindow) pointing to localhost
├── Bundles JRE 21 — no Java installation required
└── Bundles the Angular frontend inside the JAR
```

User data is stored in `%APPDATA%\Moneto\` and survives updates and uninstalls.

## Requirements (development)

- Node.js + npm
- Java 17+ (for running in dev mode)
- The Spring Boot JAR built from [home-budget-tracker](https://github.com/mcasetta/home-budget-tracker) placed at `resources/moneto.jar`

## Development

```bash
npm install
npm start
```

The app expects `resources/moneto.jar` and falls back to system `java` if no bundled JRE is found in `resources/jre/`.

## Building the installer

See `build_installer.bat`. Requirements:

- JRE 21 extracted to `resources/jre/` (download from [Adoptium](https://adoptium.net/temurin/releases/), Windows x64, JRE, zip)
- Run as Administrator (needed by electron-builder for NSIS)

## Releasing

See `release.bat`. Requires [GitHub CLI](https://cli.github.com) (`gh`).

1. Bump version in `package.json`
2. Run `build_installer.bat`
3. Run `release.bat` — creates a draft GitHub Release
4. Review and publish the release on GitHub
5. Installed apps will prompt users to update on next launch

## License

Non-commercial use only. See [LICENSE](LICENSE).
