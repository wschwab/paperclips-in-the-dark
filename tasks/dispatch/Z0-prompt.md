# Task Z0 — Zero feasibility spike

You are Grok 4.5, implementing task Z0 of paperclips-in-the-dark.

Read first: `PAPERCLIPS.md` §10 (all of it, incl. 10.3 escape hatch) + §1
(Track Z thesis), `tasks/Z0-zero-spike.md` (acceptance).

Mission: determine, with evidence, whether Zero (zerolang.ai) can support a
full HTTP backend for this project, or whether Track Z must narrow to the
§10.3 escape hatch (domain core behind line-delimited JSON stdio, fronted by
the existing shim at `conformance/bin/http-stdio-shim.mjs` — read it,
read-only, to see the protocol).

Steps:
1. **Toolchain acquisition is part of this spike.** No Zero toolchain is
   installed. Find it (zerolang.ai, its repo, package registries), install
   user-locally (~/.local or vendored under backend-zero/toolchain/ if
   small), and document EXACTLY how — versions, URLs, commands — in the memo.
   If no working toolchain can be obtained at all, that is itself a finding:
   document the attempts and recommend no-go.
2. Spike, under `backend-zero/spike/`: (a) hello-world compile+run;
   (b) JSON parse + emit; (c) read/write a file atomically (tmp+rename);
   (d) serve HTTP GET /api/health on a port — or demonstrate the closest
   achievable (TCP? stdio only?) and say so plainly.
3. Write the go/no-go memo at `docs/pages/zero/z0-go-no-go.mdx`:
   what worked, what didn't, exact errors, toolchain quality notes (JSON
   diagnostics? repair metadata? — the agent-facing features are the point
   of the experiment), and an explicit recommendation:
   full-parallel / escape-hatch / no-go. THE DECISION IS THE HUMAN'S —
   you recommend, with evidence.

Rules:
- Touch ONLY `backend-zero/` and `docs/pages/zero/`. Everything else
  read-only. No git or jj commands. Kill any processes you start.
- Honest failure beats optimistic mush. If Zero can't do it, say so crisply.

Acceptance (orchestrator-run):
- Memo exists with reproducible toolchain-install steps (or documented
  failed attempts) and an explicit recommendation.
- Spike artifacts under backend-zero/spike/ runnable per memo instructions
  (orchestrator will attempt at least hello-world).

When done print: recommendation, one-paragraph rationale, spike file tree.
