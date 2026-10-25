import { z } from 'zod';
export const profileInput = { profileId: z.number().int().positive().safe() };
export const statementInput = { ...profileInput, balanceId: z.number().int().positive().safe(), currency: z.string().regex(/^[A-Z]{3}$/), start: z.string().datetime(), end: z.string().datetime() };
export type StatementInput = z.infer<z.ZodObject<typeof statementInput>>;
export class WiseClient {
  constructor(private token: string, private sandbox = false, private fetcher: typeof fetch = fetch) {
    if (!token || /\s/.test(token)) throw new Error('A valid Wise token is required');
  }
  private async get(path: string, query: Record<string,string> = {}): Promise<any> {
    const url = new URL(`https://${this.sandbox ? 'api.sandbox.transferwise.tech' : 'api.wise.com'}/2026Q4/${path}`);
    url.search = new URLSearchParams(query).toString();
    let response: Response;
    try { response = await this.fetcher(url, { headers: { Authorization: `Bearer ${this.token}` }, redirect:'error', signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error('Wise network request failed or timed out'); }
    if (!response.ok) throw new Error(`Wise HTTP ${response.status}${response.status === 403 ? ': token permission or SCA approval required' : response.status === 429 ? ': rate limited; retry later' : ''}`);
    try { return await response.json(); } catch { throw new Error('Wise returned invalid JSON'); }
  }
  async profiles() { const data = await this.get('profiles'); if (!Array.isArray(data)) throw new Error('Unexpected profiles response'); return data; }
  async balances(input: {profileId:number}) { const {profileId} = z.object(profileInput).parse(input); const data = await this.get(`profiles/${profileId}/balances`, {types:'STANDARD,SAVINGS'}); if (!Array.isArray(data)) throw new Error('Unexpected balances response'); return data; }
  async statement(input: StatementInput) {
    const a = z.object(statementInput).parse(input);
    const duration = Date.parse(a.end) - Date.parse(a.start);
    if (duration <= 0 || duration > 469*86400000) throw new Error('Statement range must be positive and at most 469 days; split larger ranges explicitly');
    const data = await this.get(`profiles/${a.profileId}/balance-statements/${a.balanceId}/statement.json`, {currency:a.currency, intervalStart:a.start, intervalEnd:a.end, type:'COMPACT'});
    if (!Array.isArray(data.transactions)) throw new Error('Unexpected statement response');
    return data;
  }
  async cardSpending(input: StatementInput) {
    const statement = await this.statement(input);
    const transactions = statement.transactions.filter((t:any) => t.details?.type === 'CARD');
    return {currency:input.currency, pendingIncluded:false, source:'COMPACT balance statement; posted card entries only, including refunds; amounts retain Wise signs', transactions};
  }
}
