import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { httpApp } from './http.js';
import { WiseClient } from './wise.js';
const wise = defineSecret('WISE_API_TOKEN'); const bearer = defineSecret('MCP_BEARER_TOKEN');
export const mcp = onRequest({secrets:[wise,bearer],region:'us-central1',maxInstances:2,invoker:'public',cors:false},(req,res)=>httpApp(new WiseClient(wise.value()),bearer.value())(req,res));
