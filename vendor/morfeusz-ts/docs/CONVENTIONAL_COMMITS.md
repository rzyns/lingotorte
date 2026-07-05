# Conventional Commits Scopes

Use meaningful scopes to clarify the area impacted by a change.

Recommended scopes:

- core: main TypeScript API surface (`src/index.ts`, types)
- native: C++ addon code (`native/`)
- dict: dictionary setup or verification scripts
- ci: GitHub workflows and automation
- release: semantic-release or tagging logic
- build: build tooling (node-gyp, tsconfig, binding.gyp)
- docs: README, CONTRIBUTING, API docs
- tests: test files or test utilities
- windows / linux / macos: OS-specific fixes
- perf: performance improvements
- security: security-related changes

Examples:

```
feat(core): add generateWithTag helper overload
fix(native): handle empty lemma gracefully
chore(ci): add semantic-release workflow
docs(contributing): document conventional commit scopes
```

Breaking changes:

```
feat(core)!: drop deprecated analyseLegacy method

BREAKING CHANGE: analyseLegacy removed; use analyse instead.
```

Keep scope concise; omit if not adding clarity.
