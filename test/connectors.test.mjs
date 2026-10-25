import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WiseClient} from '../dist/wise.js';
import {httpApp} from '../dist/http.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const args={profileId:1,balanceId:2,currency:'EUR',start:'2026-01-01T00:00:00Z',end:'2026-02-01T00:00:00Z'};
const fixtures={transactions:[{details:{type:'CARD'},amount:{value:-12,currency:'EUR'}},{details:{type:'TRANSFER'},amount:{value:5,currency:'EUR'}},{details:{type:'CARD'},amount:{value:2,currency:'EUR'}}]};
test('GET-only client constructs versioned URLs and preserves card refunds',async()=>{
 const calls=[];const c=new WiseClient('synthetic-token',false,async(u,o)=>{calls.push([u,o]);return Response.json(fixtures);});
 const r=await c.cardSpending(args);assert.equal(r.transactions.length,2);assert.equal(r.pendingIncluded,false);assert.equal(r.transactions[1].amount.value,2);assert.equal(calls[0][0].pathname,'/2026Q4/profiles/1/balance-statements/2/statement.json');assert.equal(calls[0][0].searchParams.get('type'),'COMPACT');assert.equal(calls[0][1].method,undefined);assert.equal(calls[0][1].redirect,'error');
});
test('rejects invalid IDs, currencies and ranges before sending',async()=>{const c=new WiseClient('synthetic',false,async()=>{throw Error('must not fetch');});for(const a of [{...args,profileId:-1},{...args,currency:'eur'},{...args,end:args.start},{...args,end:'2030-01-01T00:00:00Z'}])await assert.rejects(c.statement(a));});
test('upstream errors never expose response bodies or credentials',async()=>{for(const status of [401,403,429,500]){const c=new WiseClient('synthetic',false,async()=>new Response('PRIVATE ACCOUNT DATA',{status}));await assert.rejects(c.profiles(),e=>e.message.includes(String(status))&&!e.message.includes('PRIVATE'));}});
test('profiles and balances return complete arrays without invented pagination',async()=>{const c=new WiseClient('synthetic',false,async()=>Response.json([{id:1},{id:2}]));assert.equal((await c.profiles()).length,2);assert.equal((await c.balances({profileId:1})).length,2);});
test('real MCP SDK client over HTTP with synthetic Wise data; all methods reject bad authentication',async()=>{
 const token='synthetic-test-only-bearer-token-1234567890';
 const c=new WiseClient('synthetic',false,async u=>Response.json(u.pathname.endsWith('profiles')?[{id:1,type:'BUSINESS'}]:u.pathname.endsWith('balances')?[{id:2,currency:'EUR'}]:fixtures));
 const listener=httpApp(c,token).listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));const url=new URL(`http://127.0.0.1:${listener.address().port}/mcp`);
 const client=new Client({name:'verification',version:'1'});
 try {for(const method of ['GET','POST','DELETE'])for(const authorization of ['', 'Bearer wrong'])assert.equal((await fetch(url,{method,headers:{authorization}})).status,401);
 await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
 assert.equal((await client.listTools()).tools.length,4);
 for(const [name,a]of [['profiles',{}],['balances',{profileId:1}],['statement',args],['card_spending',args]])assert.notEqual((await client.callTool({name,arguments:a})).isError,true);
 }finally{await client.close();await new Promise(r=>listener.close(r));}
});

test('synthetic Firebase manifest isolates Wise function and runtime secrets',async()=>{
 process.env.GCLOUD_PROJECT='synthetic-wise-test';
 const module=await import('../dist/firebase.js');
 assert.deepEqual(Object.keys(module),['wiseMcp']);
 const endpoint=module.wiseMcp.__endpoint;
 assert.equal(endpoint.serviceAccountEmail,'wise-connectors-runtime@synthetic-wise-test.iam.gserviceaccount.com');
 assert.deepEqual(endpoint.secretEnvironmentVariables.map(x=>x.key).sort(),['WISE_CONNECTORS_API_TOKEN','WISE_CONNECTORS_MCP_BEARER_TOKEN']);
 assert.equal(endpoint.minInstances,0);assert.equal(endpoint.maxInstances,2);
});
