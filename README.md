# Wise Connectors

Read-only Wise Business API CLI and MCP server. MIT licensed; clone and build locally. This package is private and is not published to npm. There are no payment, transfer, conversion or other money-moving tools.

## Install

Use Node.js 22 and npm. The TypeScript ESM/Commander layout follows hcassar93/trackabi-cli and hcassar93/google-indexing-cli.

```sh
git clone https://github.com/hcassar93/wise-connectors.git
cd wise-connectors
npm ci
npm test
npm run build
# Optional: npm link
node dist/cli.js --help
```

## Credentials and local use

Create a Wise **read-only** personal API token in Wise settings, or a sandbox token for sandbox testing. Run the following in your own terminal after approving persistent local credential storage:

```sh
python3 scripts/credentials.py
```

Run in an interactive terminal: redirected input/output, missing controlling terminals, inability to disable echo, existing credentials, and symlink configuration paths are refused. Input is hidden, with no visible-input fallback. The helper creates `~/.config/wise-connectors/credentials.json` with mode 0600 inside a 0700 directory. It generates a cryptographically random 48-byte bearer credential and refuses to overwrite existing credentials. Never paste tokens in chat, shell arguments, Git, or issue reports. The CLI reads this file; it does not accept tokens as flags. Protect CLI output: it contains real financial/account information.

```sh
node dist/cli.js profiles
node dist/cli.js balances --profile-id 123
node dist/cli.js statement --profile-id 123 --balance-id 456 --currency EUR --start 2026-01-01T00:00:00Z --end 2026-02-01T00:00:00Z
node dist/cli.js card-spending --profile-id 123 --balance-id 456 --currency EUR --start 2026-01-01T00:00:00Z --end 2026-02-01T00:00:00Z
node dist/cli.js http
node dist/cli.js stdio
```

Stdio MCP configuration: command `node`, args `[/absolute/path/wise-connectors/dist/cli.js, stdio]`. Local HTTP URL: `http://127.0.0.1:8787/mcp`; use the bearer value from the protected credentials file in the Authorization header. HTTP uses stateless Streamable HTTP, JSON responses, and rejects browser Origin headers. All HTTP methods and paths authenticate before body parsing. Stdio uses local OS access control.

Tools: `profiles`, `balances`, `statement`, `card_spending`. The wrappers share `src/wise.ts`; only GET requests to fixed Wise hosts are possible. All requests time out at 30 seconds and reject redirects. Errors omit upstream bodies and credentials. Rate limits are surfaced without automatic retry storms.

## Data scope and limits

The API version is pinned to **2026Q4**, checked against Wise documentation on 2026-10-25. Profiles and balances return complete arrays; these endpoints and statements expose no pagination parameters in the current documentation. We do not invent offset/cursor pagination. Each statement call covers one balance, currency and UTC range of at most 469 days. Larger ranges must be explicitly split; keep original boundaries when reconciling adjacent reports. Invalid ranges and non-uppercase three-letter currencies are rejected before network access.

Card spending returns statement entries with `details.type === CARD`, including refunds with original signed amounts. It does not query pending card authorizations and must not be treated as a pending-transaction feed. No cross-currency totals are computed. Statement availability depends on token permissions and account region; 403 may require Wise SCA. This implementation does not automate SCA or claim that a successful profiles request proves statement permission.

Sources: [Wise profiles](https://docs.wise.com/api-reference/profile/profilelist), [balances](https://docs.wise.com/api-reference/balance), [statements](https://docs.wise.com/api-reference/balance-statement/balancestatementget), [Firebase runtime](https://firebase.google.com/docs/functions/manage-functions).

## Firebase setup

Prerequisites: Node.js 22, bundled Firebase CLI (`npx firebase`), current Google Cloud CLI (`gcloud`) with a supported Python runtime, `gcloud auth login`, `npx firebase login`, permission to create projects and link an approved billing account, and permission to enable services, deploy functions and manage secrets/IAM. Firebase Functions requires billable/Blaze services; The proposed function explicitly uses `minInstances: 0`, `maxInstances: 2`, region `us-central1`, 256 MiB memory, one CPU, concurrency 10, and a 60-second request timeout. Zero minimum instances permits scale-to-zero; a maximum of two is not a spending cap.

```sh
npm run setup
```

Setup asks for a new globally unique project ID, billing account ID and explicit approval of persistent secrets/access and billing. It creates only the selected new project, enables Firebase/Functions/Cloud Run/Build/Artifact Registry/Secret Manager, stores both tokens in Secret Manager, and deploys the function. Firebase configures function runtime secret access during deployment. The HTTPS invoker is public at the infrastructure level so custom bearer authentication can work; the application requires the bearer credential on every request.

Project identity and progress are stored outside the repository in `~/.config/wise-connectors/deployment.json`. A lock prevents concurrent setup. Reruns reuse that identity, compare existing secret values without printing them, and never silently rotate credentials or create a second project. If creation succeeded but state saving failed, setup stops rather than adopting an existing project: manually verify ownership and repair the phase in the protected state file. The same rule applies to interrupted Firebase attachment. Setup suppresses subprocess output to avoid secret disclosure; diagnose failures using read-only project/permission commands, never debug-print secret-access results.

On success it prints the endpoint URL and writes `~/.config/wise-connectors/client.json` (0600) containing the MCP client URL and bearer header. Keep this file private. Never commit generated configuration. Production hosting currently requires a production Wise token; sandbox remains available for local testing.

## Verification

`npm test` uses synthetic fixtures only, including a real MCP SDK client connecting to a local HTTP server, all four tools, and missing/wrong bearer checks for GET/POST/DELETE. These are not live Wise tests. CI uses Node.js 22. Live CLI, local HTTP with real Wise data, and hosted verification require credentials and a deployed endpoint; see VERIFICATION.md for actual execution status.

For live verification, run `node scripts/verify-live.mjs` after credential approval/entry, then `node scripts/verify-live.mjs --hosted` after deployment. Output contains only verification summaries; account data stays in memory. On this Mac, the existing gcloud installation works with `CLOUDSDK_PYTHON=/opt/homebrew/bin/python3.10`; use a current gcloud installation on other systems.

### Billing decision

Firebase deployment requires the pay-as-you-go Blaze plan. Second-generation functions use Cloud Run billing for requests, CPU/memory time and outbound networking; builds, artifact storage, logging and Secret Manager can add charges. Free allowances do not guarantee a zero bill, especially on a shared billing account. Secret Manager currently includes six active versions and 10,000 accesses per month across the billing account; this setup intends two secret versions. Unauthorized requests can still consume infrastructure resources before the application rejects them. No billing account or budget has been configured by this repository.

Sources checked 2026-10-25: [Firebase pricing](https://firebase.google.com/pricing), [Cloud Run pricing](https://cloud.google.com/run/pricing), [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing), [function scaling options](https://firebase.google.com/docs/functions/manage-functions).
