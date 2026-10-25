import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WiseClient, profileInput, statementInput } from './wise.js';
export function server(client: WiseClient) {
 const s = new McpServer({name:'wise-connectors',version:'0.1.0'});
 const annotations = {readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true};
 const wrap = (fn: (a:any)=>Promise<any>) => async (a:any) => { try { return {content:[{type:'text' as const,text:JSON.stringify(await fn(a))}]}; } catch(e) { return {isError:true,content:[{type:'text' as const,text:e instanceof Error ? e.message : 'Request failed'}]}; } };
 s.registerTool('profiles',{description:'List Wise profiles',inputSchema:{},annotations},wrap(()=>client.profiles()));
 s.registerTool('balances',{description:'List standard and savings balances',inputSchema:profileInput,annotations},wrap(a=>client.balances(a)));
 s.registerTool('statement',{description:'Read COMPACT statement, maximum 469 days',inputSchema:statementInput,annotations},wrap(a=>client.statement(a)));
 s.registerTool('card_spending',{description:'Posted card entries from statements; excludes pending authorizations',inputSchema:statementInput,annotations},wrap(a=>client.cardSpending(a)));
 return s;
}
