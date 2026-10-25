import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,statSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline/promises';
const root=join(homedir(),'.config','wise-connectors');
const file=join(root,'credentials.json');
const argv=process.argv.slice(2);
function option(name){const i=argv.indexOf(name);return i<0?undefined:argv[i+1];}
const existing=option('--existing-project');
const account=option('--account');
if(existing && (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(existing)||!account))throw Error('Existing-project mode requires a valid project ID and explicit --account email');
const requiredServices=['firebase.googleapis.com','cloudfunctions.googleapis.com','run.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','secretmanager.googleapis.com'];

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
 if(state && (existing ? state.projectId!==existing || state.mode!=='existing' : state.mode==='existing'))throw Error('Saved deployment target differs; refusing to switch projects or modes');
 if(state?.account && account!==state.account)throw Error('Saved deployment account differs');
 const cloud=(args,input)=>run('gcloud',[...args,...(account?[`--account=${account}`]:[])],input);
 const firebase=(args)=>run('npx',['--no-install','firebase',...args,...(account?[`--account=${account}`]:[])]);
 if(existing){
  const actual=JSON.parse(cloud(['projects','describe',existing,'--format=json']));
  if(actual.projectId!==existing||actual.lifecycleState!=='ACTIVE')throw Error('Existing project is not active');
  const billing=JSON.parse(cloud(['billing','projects','describe',existing,'--format=json']));
  if(!billing.billingEnabled)throw Error('Existing-project mode requires billing already enabled; no billing links will be changed');
  const enabled=JSON.parse(cloud(['services','list','--enabled',`--project=${existing}`,'--format=json'])).map(x=>x.config?.name);
  if(requiredServices.some(x=>!enabled.includes(x)))throw Error('Required services are missing; existing-project mode will not enable services automatically');
  const projects=JSON.parse(firebase(['projects:list','--json']));
  if(!projects.result?.some(x=>x.projectId===existing))throw Error('Selected Firebase account must already have access to this Firebase project');
  if(!state){state={projectId:existing,account,mode:'existing',phase:'firebase',billing:billing.billingAccountName};save(statePath,state);}
 }

 const rl=createInterface({input:process.stdin,output:process.stdout});
 try {
  if(!state){
   const projectId=await rl.question('New globally unique project ID (6–30 lowercase letters/digits/hyphens): ');
   if(!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId))throw Error('Invalid project ID');
   const billing=await rl.question('Approved billing account ID: ');if(!/^[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}$/.test(billing))throw Error('Invalid billing account ID');
   state={projectId,billing,phase:'planned'};save(statePath,state);
  }
  const answer=await rl.question(`Approve ${existing?'adding only Wise resources to existing':'creating/configuring'} project ${state.projectId}, storing both credentials in Secret Manager, dedicated Wise runtime access, and a public HTTPS endpoint protected by the bearer token? Existing billing: ${state.billing}. Type APPROVE: `);
  if(answer!=='APPROVE')throw Error('No cloud changes approved');
 }finally{rl.close();}
 const p=state.projectId;
 if(!existing && state.phase==='planned'){
  // A create failure is never interpreted as permission to adopt an existing project.
  cloud(['projects','create',p,'--name=Wise Connectors','--labels=app=wise-connectors','--quiet']);state.phase='created';save(statePath,state);
 }
 if(!existing){
  const actual=JSON.parse(cloud(['projects','describe',p,'--format=json']));if(actual.labels?.app!=='wise-connectors')throw Error('Ownership label missing; refusing to configure this project');
  cloud(['billing','projects','link',p,`--billing-account=${state.billing}`,'--quiet']);
  cloud(['services','enable',...requiredServices,`--project=${p}`,'--quiet']);
  if(state.phase==='created'){firebase(['projects:addfirebase',p,'--non-interactive']);state.phase='firebase';save(statePath,state);}
 }
 const functions=JSON.parse(cloud(['functions','list',`--project=${p}`,'--format=json']));
 if(functions.some(f=>f.labels?.['firebase-functions-codebase']==='wise-connectors' && f.name.split('/').at(-1)!=='wiseMcp'))throw Error('Codebase contains another function; refusing deployment to prevent unrelated changes');
 const collision=functions.find(f=>f.name.split('/').at(-1)==='wiseMcp');
 if(collision && collision.labels?.['firebase-functions-codebase']!=='wise-connectors')throw Error('wiseMcp already belongs to another codebase; refusing to alter it');
 const serviceAccount=`wise-connectors-runtime@${p}.iam.gserviceaccount.com`;
 const accounts=JSON.parse(cloud(['iam','service-accounts','list',`--project=${p}`,'--format=json']));
 const runtime=accounts.find(a=>a.email===serviceAccount);
 if(runtime && runtime.description!=='Managed exclusively by wise-connectors')throw Error('Runtime service account name collision; refusing to alter existing access');
 if(!runtime)cloud(['iam','service-accounts','create','wise-connectors-runtime',`--project=${p}`,'--display-name=Wise Connectors Runtime','--description=Managed exclusively by wise-connectors','--quiet']);
 const secrets=JSON.parse(cloud(['secrets','list',`--project=${p}`,'--format=json']));
 for(const [name,value] of [['WISE_CONNECTORS_API_TOKEN',credentials.wiseToken],['WISE_CONNECTORS_MCP_BEARER_TOKEN',credentials.bearerToken]]){
  const found=secrets.find(s=>s.name.endsWith('/'+name));
  if(found && found.labels?.app!=='wise-connectors')throw Error('Secret name collision; refusing to read or alter unrelated credentials');
  if(!found)cloud(['secrets','create',name,`--project=${p}`,'--labels=app=wise-connectors','--replication-policy=automatic','--quiet']);
  const versions=JSON.parse(cloud(['secrets','versions','list',name,`--project=${p}`,'--format=json']));
  if(versions.length===0)cloud(['secrets','versions','add',name,`--project=${p}`,'--data-file=-','--quiet'],value);
  else {const remote=cloud(['secrets','versions','access','latest',`--secret=${name}`,`--project=${p}`]);if(remote!==value)throw Error('Existing secret differs; refusing silent credential rotation');}
 }
 firebase(['deploy','--only','functions:wise-connectors:wiseMcp',`--project=${p}`,'--non-interactive']);
 const url=cloud(['functions','describe','wiseMcp','--gen2','--region=us-central1',`--project=${p}`,'--format=value(serviceConfig.uri)'])+'/mcp';
 save(join(root,'client.json'),{mcpServers:{wise:{url,headers:{Authorization:`Bearer ${credentials.bearerToken}`}}}});
 state.phase='deployed';state.url=url;save(statePath,state);
 console.log(`Endpoint: ${url}\nProtected client configuration: ${join(root,'client.json')}`);
}catch(e){console.error(e.message);process.exitCode=1;}finally{if(lock!==undefined){closeSync(lock);unlinkSync(join(root,'setup.lock'));}}
