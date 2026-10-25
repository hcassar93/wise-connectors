import { spawnSync } from 'node:child_process';
/** Explicit opt-in only: captures the payload in memory, never prints or persists it. */
export function wiseSecret(project:string, account:string, environment:string): {wiseToken:string;sandbox:boolean} {
 if(!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) || !/^[^\s@]+@[^\s@]+$/.test(account)) throw new Error('Explicit Google project and account required');
 if(!['production','sandbox'].includes(environment)) throw new Error('Explicit Wise environment must be production or sandbox');
 const result=spawnSync('gcloud',['secrets','versions','access','latest','--secret=WISE_CONNECTORS_API_TOKEN',`--project=${project}`,`--account=${account}`],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:16384});
 if(result.status!==0) throw new Error('Wise Secret Manager access failed; private output suppressed');
 const wiseToken=result.stdout.trim();
 if(!wiseToken || /\s/.test(wiseToken)) throw new Error('Invalid Wise secret value');
 return {wiseToken,sandbox:environment==='sandbox'};
}
