import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import type { Config } from '../config.ts';
import { AppError } from '../errors.ts';
import { GenerationError } from '../generation/types.ts';

const AUTH = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const jwks = createRemoteJWKSet(new URL(`${AUTH}/.well-known/jwks.json`));
const Tokens = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), id_token: z.string().optional(), expires_in: z.number().positive(), scope: z.string() });
interface Credentials { host: string; client?: string; subject?: string; email?: string; access?: string; refresh?: string; idToken?: string; expires?: number; scope?: string; model?: string }
export class ChatGPT {
  private credentials: Credentials;
  private file: string;
  private listener: Server | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private memoryOnly: boolean;
  private refreshJob: Promise<string> | null = null;
  private lastError: string | null = null;
  readonly available: boolean;
  private network: typeof fetch;
  constructor(config: Config, network: typeof fetch = fetch) {
    this.network = network;
    this.memoryOnly = config.env === 'test';
    this.available = ['127.0.0.1', 'localhost', '::1'].includes(config.host) && config.env !== 'production';
    this.file = join(dirname(config.databasePath), 'chatgpt-credentials.json');
    if (this.memoryOnly) { this.credentials = { host: `urn:uuid:${randomUUID()}` }; return; }
    try { this.credentials = JSON.parse(readFileSync(this.file, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot read ChatGPT credentials'); this.credentials = { host: `urn:uuid:${randomUUID()}` }; }
  }
  private save() {
    if (this.memoryOnly) return;
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.credentials), { mode: 0o600 });
    renameSync(temporary, this.file);
  }
  status() { return { available: this.available, connected: this.available && Boolean(this.credentials.access), email: this.credentials.email ?? null, model: this.credentials.model ?? null, connecting: Boolean(this.listener), error: this.lastError }; }
  async start(returnUrl: string): Promise<string> {
    if (!this.available) throw new AppError(409, 'local_only', 'ChatGPT plan sign-in is configured for this local workspace only');
    if (this.listener) throw new AppError(409, 'sign_in_running', 'A ChatGPT sign-in is already open; finish it or wait five minutes');
    this.lastError = null;
    this.save();
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const prior = { ...this.credentials };
    let callback = '';
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/auth/callback') { res.writeHead(404).end(); return; }
      if (url.searchParams.get('state') !== state) { res.writeHead(400).end('Invalid sign-in state.'); return; }
      clearTimeout(timer);
      try {
        if (url.searchParams.has('error')) throw new Error('ChatGPT authorization was not granted. Please try again.');
        const client = url.searchParams.get('client_id') ?? prior.client;
        if (!client || client === 'dynamic_agent_client' || (prior.client && client !== prior.client)) throw new Error('ChatGPT returned an invalid registration.');
        const code = url.searchParams.get('code');
        if (!code) throw new Error('ChatGPT returned no authorization code.');
        const token = await this.exchange({ grant_type: 'authorization_code', client_id: client, code, code_verifier: verifier, redirect_uri: callback, resource: RESOURCE });
        if (!token.id_token) throw new Error('ChatGPT returned no identity token.');
        if (this.listener !== server) throw new Error('ChatGPT sign-in was cancelled.');
        const { payload } = await jwtVerify(token.id_token, jwks, { issuer: AUTH, audience: client });
        if (payload.nonce !== nonce || !payload.sub || (prior.subject && payload.sub !== prior.subject)) throw new Error('ChatGPT identity validation failed.');
        if (this.listener !== server) throw new Error('ChatGPT sign-in was cancelled.');
        if (!token.scope.split(' ').includes('chatgpt.tokens.use.direct')) throw new Error('Permission to use your ChatGPT plan was not granted.');
        this.credentials = { host: prior.host, client, subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined,
          access: token.access_token, refresh: token.refresh_token, idToken: token.id_token, expires: Date.now() + token.expires_in * 1000, scope: token.scope };
        this.save();
      } catch (error) {
        this.lastError = error instanceof Error && !(error instanceof TypeError) ? error.message : 'ChatGPT sign-in failed. Please try again.';
      } finally {
        res.writeHead(303, { Location: `${returnUrl}/#/storage`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).end();
        server.close(); if (this.listener === server) this.listener = null;
      }
    });
    this.listener = server;
    const timer = setTimeout(() => { server.close(); this.listener = null; this.lastError = 'Sign-in timed out. Please try again.'; }, 5 * 60_000);
    this.timer = timer;
    timer.unref();
    try {
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    } catch { clearTimeout(timer); this.listener = null; throw new AppError(500, 'callback_failed', 'Cannot start the local sign-in callback'); }
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No callback address');
    callback = `http://127.0.0.1:${address.port}/auth/callback`;
    const params = new URLSearchParams({ client_id: prior.client ?? 'dynamic_agent_client', ext_agent_host_id: prior.host, response_type: 'code', redirect_uri: callback,
      scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource: RESOURCE, state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
    if (!prior.client) params.set('agent_name_hint', 'Organic Content Engine');
    else if (prior.idToken) params.set('id_token_hint', prior.idToken);
    return `${AUTH}/api/accounts/authorize?${params}`;
  }
  private async exchange(params: Record<string, string>) {
    const response = await this.network(`${AUTH}/api/accounts/oauth/token`, { method: 'POST', body: new URLSearchParams(params), redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new GenerationError(`ChatGPT authorization failed (HTTP ${response.status}). Reconnect your account.`);
    return Tokens.parse(await response.json());
  }
  async access(): Promise<string> {
    if (!this.available) throw new GenerationError('ChatGPT plan usage is enabled only for the local workspace.');
    if (!this.credentials.access) throw new GenerationError('Connect ChatGPT on the Storage page first.');
    if ((this.credentials.expires ?? 0) > Date.now() + 60000) return this.credentials.access;
    this.refreshJob ??= this.refresh().finally(() => { this.refreshJob = null; });
    return this.refreshJob;
  }
  private async refresh() {
    const before = this.credentials;
    if (!before.refresh || !before.client) throw new GenerationError('Reconnect ChatGPT to renew permission.');
    const token = await this.exchange({ grant_type: 'refresh_token', client_id: before.client, refresh_token: before.refresh, resource: RESOURCE });
    if (this.credentials !== before) throw new GenerationError('ChatGPT connection changed. Try again.');
    if (!token.scope.split(' ').includes('chatgpt.tokens.use.direct')) throw new GenerationError('ChatGPT plan permission is missing. Reconnect your account.');
    this.credentials = { ...before, access: token.access_token, refresh: token.refresh_token ?? before.refresh, expires: Date.now() + token.expires_in * 1000, scope: token.scope };
    this.save(); return token.access_token;
  }
  async models() {
    const response = await this.network(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${await this.access()}` }, redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new GenerationError(`Cannot load ChatGPT models (HTTP ${response.status}).`);
    const data = await response.json() as { models?: { slug: string; display_name: string; visibility: string }[] };
    return (data.models ?? []).filter(m => m.visibility === 'list').map(m => ({ id: m.slug, name: m.display_name }));
  }
  async selectModel(model: string) {
    if (!(await this.models()).some(m => m.id === model)) throw new AppError(422, 'model_unavailable', 'Choose a model available to your ChatGPT account');
    this.credentials.model = model; this.save();
  }
  async disconnect() {
    if (this.timer) clearTimeout(this.timer);
    if (this.listener) { this.listener.close(); this.listener = null; }
    const prior = this.credentials;
    this.credentials = { host: prior.host }; this.save(); this.lastError = null;
    let revoked = !prior.refresh;
    try {
      if (prior.refresh && prior.client) {
        const discovery = await this.network(`${AUTH}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000), redirect: 'error' });
        const { revocation_endpoint: endpoint } = await discovery.json() as { revocation_endpoint: string };
        if (new URL(endpoint).origin !== AUTH) throw new Error('Invalid revocation endpoint');
        revoked = (await this.network(endpoint, { method: 'POST', body: new URLSearchParams({ token: prior.refresh, token_type_hint: 'refresh_token', client_id: prior.client }), signal: AbortSignal.timeout(10000), redirect: 'error' })).ok;
      }
    } catch { revoked = false; }
    this.credentials = { host: prior.host }; this.save(); this.lastError = null;
    return { revoked };
  }
  async complete(prompt: string, images: unknown[] = []) {
    const model = this.credentials.model;
    if (!model) throw new GenerationError('Choose a ChatGPT model on the Storage page first.');
    const response = await this.network(`${RESOURCE}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${await this.access()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, store: false, stream: true, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, ...images] }] }), redirect: 'error', signal: AbortSignal.timeout(180000) });
    if (!response.ok || !response.body) throw new GenerationError(`ChatGPT request failed (HTTP ${response.status}). Check your connection and plan usage.`);
    let buffer = '', result = '', completed = false;
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop()!;
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        const event = JSON.parse(payload);
        if (event.type === 'response.output_text.delta') result += event.delta;
        if (['response.failed', 'response.incomplete', 'error'].includes(event.type)) throw new GenerationError('ChatGPT could not complete generation. Check plan usage or reconnect.');
        if (event.type === 'response.completed') completed = true;
      }
    }
    if (!completed || !result.trim()) throw new GenerationError('ChatGPT response was interrupted or empty.');
    return result;
  }
}
