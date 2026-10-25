import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('setup refuses unapproved cloud changes and reruns without duplicate projects or secret rotation (mock CLIs)',()=>{
 const home=mkdtempSync(join(tmpdir(),'wise-setup-test-'));const root=join(home,'.config','wise-connectors');const bin=join(home,'bin');mkdirSync(root,{recursive:true});mkdirSync(bin);
 writeFileSync(join(root,'credentials.json'),JSON.stringify({wiseToken:'synthetic-wise',bearerToken:'synthetic-bearer'}),{mode:0o600});
 const mock=`#!/usr/bin/env node
const fs=require('fs'),path=require('path');const a=process.argv.slice(2),f=path.join(process.env.HOME,'calls.json');const calls=fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):[];calls.push(a);fs.writeFileSync(f,JSON.stringify(calls));
const sf=path.join(process.env.HOME,'cloud.json');let s=fs.existsSync(sf)?JSON.parse(fs.readFileSync(sf)):{secrets:{}};
if(a[0]==='projects'&&a[1]==='describe')console.log(JSON.stringify({labels:{app:'wise-connectors'}}));
if(a[0]==='secrets'&&a[1]==='list')console.log(JSON.stringify(Object.keys(s.secrets).map(n=>({name:'projects/mock/secrets/'+n}))));
if(a[0]==='secrets'&&a[1]==='create')s.secrets[a[2]]=null;
if(a[0]==='secrets'&&a[1]==='versions'&&a[2]==='list')console.log(JSON.stringify(s.secrets[a[3]]?[{name:'1'}]:[]));
if(a[0]==='secrets'&&a[1]==='versions'&&a[2]==='add')s.secrets[a[3]]=fs.readFileSync(0,'utf8');
if(a[0]==='secrets'&&a[1]==='versions'&&a[2]==='access')console.log(s.secrets[a.find(x=>x.startsWith('--secret=')).slice(9)]);
if(a[0]==='functions'&&a[1]==='describe')console.log('https://synthetic.invalid');
fs.writeFileSync(sf,JSON.stringify(s));
`;
 for(const name of ['gcloud','npx'])writeFileSync(join(bin,name),mock,{mode:0o700});
 const env={...process.env,HOME:home,PATH:bin+':'+process.env.PATH};
 // Seed a planned identity so one-line approval works with piped stdin.
 const state=join(root,'deployment.json');writeFileSync(state,JSON.stringify({projectId:'synthetic-wise-test',billing:'AAAAAA-BBBBBB-CCCCCC',phase:'planned'}),{mode:0o600});
 const run=input=>spawnSync(process.execPath,['scripts/setup.mjs'],{env,input,encoding:'utf8'});
 try{
  assert.equal(run('NO\n').status,1);
  let calls=JSON.parse(readFileSync(join(home,'calls.json')));assert.equal(calls.some(a=>a[0]==='projects'&&a[1]==='create'),false);
  for(let i=0;i<2;i++){const r=run('APPROVE\n');assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.includes('synthetic-bearer'),false);}
  calls=JSON.parse(readFileSync(join(home,'calls.json')));
  assert.equal(calls.filter(a=>a[0]==='projects'&&a[1]==='create').length,1);
  assert.equal(calls.filter(a=>a[0]==='secrets'&&a[2]==='add').length,2);
  assert.equal(JSON.parse(readFileSync(join(root,'client.json'))).mcpServers.wise.url,'https://synthetic.invalid/mcp');
 }finally{rmSync(home,{recursive:true,force:true});}
});
