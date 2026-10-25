import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {wiseSecret} from '../dist/secret.js';
test('synthetic secret read requires explicit environment and returns payload only in memory',()=>{
 const dir=mkdtempSync(join(tmpdir(),'wise-secret-test-'));const previous=process.env.PATH;
 try{
  writeFileSync(join(dir,'gcloud'),'#!/bin/sh\nprintf synthetic-secret-only\n',{mode:0o700});process.env.PATH=dir+':'+previous;
  assert.throws(()=>wiseSecret('synthetic-project','synthetic@example.invalid',''),/environment/);
  assert.deepEqual(wiseSecret('synthetic-project','synthetic@example.invalid','production'),{wiseToken:'synthetic-secret-only',sandbox:false});
  assert.equal(wiseSecret('synthetic-project','synthetic@example.invalid','sandbox').sandbox,true);
 }finally{process.env.PATH=previous;rmSync(dir,{recursive:true,force:true});}
});
test('synthetic failed secret read suppresses private subprocess output',()=>{
 const dir=mkdtempSync(join(tmpdir(),'wise-secret-error-'));const previous=process.env.PATH;
 try{
  writeFileSync(join(dir,'gcloud'),'#!/bin/sh\nprintf synthetic-private-value >&2\nexit 1\n',{mode:0o700});process.env.PATH=dir+':'+previous;
  assert.throws(()=>wiseSecret('synthetic-project','synthetic@example.invalid','production'),e=>!e.message.includes('synthetic-private-value')&&e.message.includes('suppressed'));
 }finally{process.env.PATH=previous;rmSync(dir,{recursive:true,force:true});}
});
