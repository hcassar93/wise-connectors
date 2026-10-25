#!/usr/bin/env node
import { Command } from 'commander';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from './config.js';
import { WiseClient } from './wise.js';
import { server } from './mcp.js';
import { httpApp } from './http.js';
const p = new Command().name('wise-connectors');
const client = ()=>{const c=config();return new WiseClient(c.wiseToken,c.sandbox);};
const output = (x:unknown)=>console.log(JSON.stringify(x,null,2));
p.command('profiles').action(async()=>output(await client().profiles()));
p.command('balances').requiredOption('--profile-id <id>').action(async o=>output(await client().balances({profileId:Number(o.profileId)})));
for(const name of ['statement','card-spending']) p.command(name).requiredOption('--profile-id <id>').requiredOption('--balance-id <id>').requiredOption('--currency <ISO>').requiredOption('--start <UTC>').requiredOption('--end <UTC>').action(async o=>{const a={...o,profileId:Number(o.profileId),balanceId:Number(o.balanceId)};output(await (name==='statement'?client().statement(a):client().cardSpending(a)));});
p.command('stdio').action(async()=>{await server(client()).connect(new StdioServerTransport());});
p.command('http').option('--port <port>','loopback port','8787').action(o=>{const c=config();httpApp(client(),c.bearerToken).listen(Number(o.port),'127.0.0.1',()=>console.error('Wise MCP listening on loopback'));});
p.parseAsync().catch(()=>{console.error('Command failed. Check arguments, protected configuration, network, Wise permissions and SCA.');process.exitCode=1;});
