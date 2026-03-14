# Installer QA Checklist

Use this checklist before publishing a Windows release build.

## Preparation

1. Run `pnpm build`.
2. Confirm the release artifacts exist in `release/<version>/`:
   - `OpenListScraper-Windows-<version>-Setup.exe`
   - `OpenListScraper-Windows-<version>-Setup.exe.blockmap`
   - `latest.yml`
3. Confirm `build/icon.ico` was regenerated from `public/app-icon.png`.

## Clean Install

1. Run the installer on a machine without an existing OpenList Scraper install.
2. Verify the installer window shows the custom app icon.
3. Install with the default path.
4. Launch the app from the installer completion screen.
5. Verify the app window, taskbar entry, and Start menu shortcut all use the custom icon.

## First Launch

1. Confirm the app opens without a crash.
2. Confirm the existing onboarding or settings flow is reachable.
3. Open the About or version surface and confirm it reports the expected version.

## Upgrade

1. Install the previous released version.
2. Run the new installer over the existing install.
3. Confirm the installation completes without requiring manual cleanup.
4. Launch the upgraded app.
5. Verify settings and local data still exist after upgrade.
6. Verify the shortcut icon remains correct after upgrade.

## Shortcuts

1. Verify the Start menu entry launches the app.
2. If a desktop shortcut is created, verify it launches the app and keeps the custom icon.
3. Pin the app to the taskbar and confirm the pinned icon stays correct after relaunch.

## Uninstall

1. Uninstall the app from Windows Settings or Apps & Features.
2. Verify the custom icon appears in the installed-apps entry before uninstall.
3. Confirm the uninstall flow completes without errors.
4. Confirm the app binaries are removed from the install directory.
5. Confirm app data behavior matches expectation:
   - user settings remain in place because `deleteAppDataOnUninstall` is `false`
   - document any manual cleanup steps only if needed

## Release Gate

Only publish the GitHub Release after every checklist item above passes or any remaining gap is explicitly documented in the release notes.
