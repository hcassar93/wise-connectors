# Verification checkpoint — 2026-10-25

Passed (synthetic): TypeScript build and 10/10 JavaScript tests on Node.js 22.23.3 plus 8/8 Python credential-entry tests. Credential tests use temporary synthetic data, including a real pseudo-terminal; no persistent live credentials are generated. The HTTP test uses the real MCP SDK client against a loopback server with synthetic Wise responses, executes all four tools, and checks missing/incorrect bearer rejection for GET, POST and DELETE (six checks). Production dependency audit: 0 vulnerabilities. Setup script syntax check passed. A mocked setup test verifies refusal without approval and safe reruns without duplicate project creation or secret rotation.

Earlier failure: loopback listener denied by execution sandbox; rerunning with scoped loopback permission passed. This was not an application failure.

Not run: live Wise CLI; local MCP with live Wise responses; cloud provisioning/deployment; hosted MCP verification. Credential helper execution was denied by automatic approval review pending separate action-time approval. No real account permissions have been verified. No cloud project or secret has been created by this task.

Known dependency limitation: npm audit reports 5 moderate findings in development-only Firebase CLI dependency chains; production audit is clean.

Use `node scripts/verify-live.mjs` after credential approval/entry to verify CLI and local HTTP without printing account data. Use `node scripts/verify-live.mjs --hosted` after deployment to repeat CLI/hosted verification. These commands make real read-only Wise calls and must not be presented as already passed.

Existing-project setup was tested only with synthetic mocked CLIs: no project creation, billing links, service enablement, Firebase attachment or deletion; exact Wise-only deployment selector and explicit account; unrelated function/codebase collisions refused. The synthetic Firebase manifest test verifies the distinct function, dedicated runtime account and scoped secret names. No real deployment has run.

Phone workflow tests are synthetic: explicit production/sandbox selection, captured Secret Manager reads and sanitized failures, and setup reuse without accessing or replacing the user-created Wise secret. No real secret payload has been accessed.
