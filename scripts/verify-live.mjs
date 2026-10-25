// Explicitly run only after approving use of the protected Wise credential.
// Captures CLI/account data in memory and prints only pass/fail summaries.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {config} from '../dist/config.js';
import {WiseClient} from '../dist/wise.js';
import {httpApp} from '../dist/http.js';
const c=config();
function cli(args){const r=spawnSync(process.execPath,['dist/cli.js',...args],{encoding:'utf8'});if(r.status!==0)throw Error('Live CLI command failed (private output suppressed)');return JSON.parse(r.stdout);}
let listener;let client;
try{
 const profiles=cli(['profiles']);const p=profiles.find(x=>x.type.toUpperCase()==='BUSINESS');if(!p)throw Error('No accessible Business profile');
 const balances=cli(['balances','--profile-id',String(p.id)]);const b=balances.find(x=>x.type==='STANDARD');if(!b)throw Error('No standard balance available for verification');
 const end=new Date().toISOString();const start=new Date(Date.now()-7*86400000).toISOString();
 const args={profileId:p.id,balanceId:b.id,currency:b.currency,start,end};
 const flags=['--profile-id',String(p.id),'--balance-id',String(b.id),'--currency',b.currency,'--start',start,'--end',end];
 for(const command of ['statement','card-spending'])cli([command,...flags]);
 console.log('PASS live CLI: profiles, balances, statement, card-spending');
 let url;
 if(process.argv.includes('--hosted'))url=JSON.parse(readFileSync(join(homedir(),'.config','wise-connectors','deployment.json'),'utf8')).url;
 else{listener=httpApp(new WiseClient(c.wiseToken,c.sandbox),c.bearerToken).listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));url=`http://127.0.0.1:${listener.address().port}/mcp`;}
 for(const method of ['GET','POST','DELETE'])for(const authorization of ['', 'Bearer incorrect'])if((await fetch(url,{method,headers:{authorization}})).status!==401)throw Error('Authentication rejection failed');
 console.log('PASS authentication: six missing/wrong bearer requests rejected');
 client=new Client({name:'wise-live-verifier',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(url),{requestInit:{headers:{Authorization:`Bearer ${c.bearerToken}`}}}));
 if((await client.listTools()).tools.length!==4)throw Error('Unexpected MCP tool count');
 for(const [name,a]of [['profiles',{}],['balances',{profileId:p.id}],['statement',args],['card_spending',args]])if((await client.callTool({name,arguments:a})).isError)throw Error('Live MCP tool failed (private output suppressed)');
 console.log(`PASS ${process.argv.includes('--hosted')?'hosted':'local'} real MCP client: initialize, listTools, four tool calls`);
}catch(e){console.error(e.message);process.exitCode=1;}finally{await client?.close();if(listener)await new Promise(r=>listener.close(r));}
