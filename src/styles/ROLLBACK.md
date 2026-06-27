# TradingView CSS design system — rollback

This design system lives under `src/styles/` and is imported from `src/views/workspace.css`.

## Quick rollback (after commit)

If the design system was committed as a single commit:

```powershell
git revert HEAD --no-edit
```

Or revert a specific commit:

```powershell
git log --oneline -- src/styles/
git revert <commit-sha> --no-edit
```

## Manual rollback (no commit yet)

From the repo root:

```powershell
.\scripts\rollback-tv-design-system.ps1
```

Or manually:

1. Delete the design system folder:
   ```powershell
   Remove-Item -Recurse -Force src\styles
   Remove-Item -Force scripts\rollback-tv-design-system.ps1
   ```
2. Restore modified files from git (only works if you had a clean baseline):
   ```powershell
   git checkout HEAD -- src/views/workspace.css src/views/chartIntervalMenu.css src/views/chartTypeMenu.css src/views/replayGoToMenu.css src/views/chartIntervalMenu.ts src/views/chartTypeMenu.ts src/views/replayGoToMenu.ts
   ```

## Files added by this change

| Path | Purpose |
|------|---------|
| `src/styles/index.css` | Barrel import |
| `src/styles/tokens.css` | Spacing, radii, motion, z-index |
| `src/styles/themes/chart-themes.css` | Light/dark semantic colors on `.rw-root` |
| `src/styles/themes/menu-portal.css` | Popover menu colors (portaled to `body`) |
| `src/styles/typography.css` | Type utilities |
| `src/styles/components/control.css` | Shared `.rw-control` button pattern |
| `src/styles/components/dropdown.css` | Shared menu row patterns |
| `src/styles/syncChartTheme.ts` | Sync theme onto portal menus |
| `scripts/rollback-tv-design-system.ps1` | One-command rollback script |

## Files modified

- `src/views/workspace.css` — imports design system; replay interval uses tokens
- `src/views/chartIntervalMenu.css` — token-based menu styles
- `src/views/chartTypeMenu.css` — token-based menu styles
- `src/views/replayGoToMenu.css` — token-based menu styles + dark theme fix
- `src/views/chartIntervalMenu.ts` — sync theme on open
- `src/views/chartTypeMenu.ts` — sync theme on open
- `src/views/replayGoToMenu.ts` — sync theme on open

## Re-apply later

If you rolled back and want the design system again, restore the commit or re-run the Agent task.
