# changelog-enforcer

> Enforce changelog updates. Block commits when code changes without documentation. Ships matter.

```bash
npx changelog-enforcer --hook pre-commit
```

```
📋 Changelog Enforcer
─────────────────────

🔴 BLOCKED — CHANGELOG.md not updated

  src/auth/jwt.js  (+45, -12)
  src/api/users.js (+23, -5)

Suggested entry added to clipboard.
Add to CHANGELOG.md and commit again.
```

## Commands

```bash
npx changelog-enforcer                    # check current state
npx changelog-enforcer --hook pre-commit  # install commit hook
npx changelog-enforcer --validate         # validate CHANGELOG format
npx changelog-enforcer --generate         # auto-generate entry
npx changelog-enforcer --bypass           # skip once
```

## Install

```bash
npx changelog-enforcer    # no install needed
npm install -g changelog-enforcer
```

---

**Zero dependencies** · **Node 18+** · Made by [NickCirv](https://github.com/NickCirv) · MIT
