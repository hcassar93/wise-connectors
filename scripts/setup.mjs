import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,statSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline/promises';
const root=join(homedir(),'.config','wise-connectors');
const file=join(root,'credentials.json');
function run(bin,args,input){const r=spawnSync(bin,args,{encoding:'utf8',input,stdio:['pipe','pipe','pipe']});if(r.status!==0)throw Error(`${bin} ${args.slice(0,2).join(' ')} failed; inspect authentication/permissions in your terminal (output suppressed to protect credentials)`);return r.stdout.trim();}
function save(path,value){writeFileSync(path,JSON.stringify(value,null,2),{mode:0o600});}
let lock;
try {
 if(!existsSync(file))throw Error('Run python3 scripts/credentials.py interactively first');
 if(statSync(file).mode&0o077)throw Error('Credentials must have mode 0600');
 const credentials=JSON.parse(readFileSync(file,'utf8'));if(credentials.sandbox)throw Error('Hosted deployment currently requires a production read-only token; sandbox credentials are local-only');
 lock=openSync(join(root,'setup.lock'),'wx',0o600);
 run('gcloud',['version']);run('npx',['--no-install','firebase','--version']);
 const statePath=join(root,'deployment.json');
 let state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):null;
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try {
  if(!state){
   const projectId=await rl.question('New globally unique project ID (6–30 lowercase letters/digits/hyphens): ');
   if(!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId))throw Error('Invalid project ID');
   const billing=await rl.question('Approved billing account ID: ');if(!/^[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}$/.test(billing))throw Error('Invalid billing account ID');
   state={projectId,billing,phase:'planned'};save(statePath,state);
  }
  const answer=await rl.question(`Approve creating/configuring project ${state.projectId}, billable Firebase services on ${state.billing}, storing both credentials in Secret Manager, and a public HTTPS endpoint protected by the bearer token? Type APPROVE: `);
  if(answer!=='APPROVE')throw Error('No cloud changes approved');
 }finally{rl.close();}
 const p=state.projectId;
 if(state.phase==='planned'){
  // A create failure is never interpreted as permission to adopt an existing project.
  run('gcloud',['projects','create',p,'--name=Wise Connectors','--labels=app=wise-connectors','--quiet']);state.phase='created';save(statePath,state);
 }
 const actual=JSON.parse(run('gcloud',['projects','describe',p,'--format=json']));if(actual.labels?.app!=='wise-connectors')throw Error('Ownership label missing; refusing to configure this project');
 run('gcloud',['billing','projects','link',p,`--billing-account=${state.billing}`,'--quiet']);
 run('gcloud',['services','enable','firebase.googleapis.com','cloudfunctions.googleapis.com','run.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','secretmanager.googleapis.com',`--project=${p}`,'--quiet']);
 if(state.phase==='created'){run('npx',['--no-install','firebase','projects:addfirebase',p,'--non-interactive']);state.phase='firebase';save(statePath,state);}
 const secrets=JSON.parse(run('gcloud',['secrets','list',`--project=${p}`,'--format=json']));
 for(const [name,value] of [['WISE_API_TOKEN',credentials.wiseToken],['MCP_BEARER_TOKEN',credentials.bearerToken]]){
  if(!secrets.some(s=>s.name.endsWith('/'+name)))run('gcloud',['secrets','create',name,`--project=${p}`,'--replication-policy=automatic','--quiet']);
  const versions=JSON.parse(run('gcloud',['secrets','versions','list',name,`--project=${p}`,'--format=json']));
  if(versions.length===0)run('gcloud',['secrets','versions','add',name,`--project=${p}`,'--data-file=-','--quiet'],value);
  else {const remote=run('gcloud',['secrets','versions','access','latest',`--secret=${name}`,`--project=${p}`]);if(remote!==value)throw Error('Existing secret differs; refusing silent credential rotation');}
 }
 run('npx',['--no-install','firebase','deploy','--only','functions:mcp',`--project=${p}`,'--non-interactive']);
 const url=run('gcloud',['functions','describe','mcp','--gen2','--region=us-central1',`--project=${p}`,'--format=value(serviceConfig.uri)'])+'/mcp';
 save(join(root,'client.json'),{mcpServers:{wise:{url,headers:{Authorization:`Bearer ${credentials.bearerToken}`}}}});
 state.phase='deployed';state.url=url;save(statePath,state);
 console.log(`Endpoint: ${url}\nProtected client configuration: ${join(root,'client.json')}`);
}catch(e){console.error(e.message);process.exitCode=1;}finally{if(lock!==undefined){closeSync(lock);unlinkSync(join(root,'setup.lock'));}}
