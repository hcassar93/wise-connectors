import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { httpApp } from './http.js';
import { WiseClient } from './wise.js';
const project = process.env.GCLOUD_PROJECT || JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId;
if (!project || !/^[a-z][a-z0-9-]+$/.test(project)) throw new Error('Firebase project identity is required for the dedicated Wise runtime account');
const wise = defineSecret('WISE_CONNECTORS_API_TOKEN'); const bearer = defineSecret('WISE_CONNECTORS_MCP_BEARER_TOKEN');
export const wiseMcp = onRequest({secrets:[wise,bearer],serviceAccount:`wise-connectors-runtime@${project}.iam.gserviceaccount.com`,region:'us-central1',minInstances:0,maxInstances:2,memory:'256MiB',cpu:1,concurrency:10,timeoutSeconds:60,invoker:'public',cors:false},(req,res)=>httpApp(new WiseClient(wise.value()),bearer.value())(req,res));
