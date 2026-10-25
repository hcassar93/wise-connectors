import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { server } from './mcp.js';
import { WiseClient } from './wise.js';
export function httpApp(client:WiseClient, token:string) {
 if (token.length < 32) throw new Error('Bearer token must contain at least 32 characters');
 const app = express(); app.disable('x-powered-by');
 app.use((req,res,next)=>{
  const actual = req.headers.authorization ?? '';
  if (!timingSafeEqual(createHash('sha256').update(actual).digest(),createHash('sha256').update(`Bearer ${token}`).digest())) {res.status(401).set('WWW-Authenticate','Bearer').end();return;}
  if (req.headers.origin) {res.status(403).end();return;}
  res.set('Cache-Control','no-store'); next();
 });
 app.use(express.json({limit:'1mb'}));
 app.all('/mcp',async(req,res)=>{
  if(req.method !== 'POST'){res.status(405).set('Allow','POST').end();return;}
  const s = server(client); const transport = new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{void transport.close();void s.close();});
  try {await s.connect(transport);await transport.handleRequest(req,res,req.body);} catch {if(!res.headersSent)res.status(500).json({error:'MCP request failed'});}
 });
 return app;
}
