# EVIDENCE-RULE-01

Cited browser evidence must be committed, not left in gitignored scratch.

## Finding

- Several cards cite `agent-docs/test-audit/browser-evidence/`, which is gitignored. A cited artifact there cannot be reproduced from the repository.
- 24 task cards already cite it. They closed before this policy and are listed as historical exemptions.

## Change

- Policy: `docs/pages/evidence-policy.mdx` (Vocs sidebar, Overview) and `tasks/README.md` "Evidence policy".
- Check: `conformance/scripts/validate-evidence-paths.mjs`, run as `npm --prefix conformance run validate:evidence`. It fails on any `tasks/*.md` card that cites the scratch path and is not in the explicit exemption list.
- The check lives in tracked `conformance/` because the existing validator chain (`agent-docs/test-audit/validate-*.js`) is gitignored and cannot be committed.

## Red and green

- Red (planted fixture `/tmp/evrule-fixture/PLANTED-01.md`, citing `agent-docs/test-audit/browser-evidence/planted/probe.json`): `PLANTED-01.md:3: cites scratch evidence path …`, exit 1.
- Green on the real tree: `validate-evidence-paths: OK (tasks/, 24 historical exemptions)`, exit 0.
- Note: the checker was written with the red fixture run after it, not before. The red result is evidence the check fails on a violating card, not a retained pre-implementation run.

## Acceptance

- The checker fails on a planted violating card, and passes on the real `tasks/` directory.
- The policy is documented in `tasks/README.md` and in the Vocs page.
- The 24 exemptions are listed explicitly in the script.
