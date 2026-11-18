import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ExternalTokenAuth } from '../src/agents/codex/external-auth.ts';
const now = 1800000000000;
const account = 'fixture-account';
const pin = createHash('sha256').update(account).digest('hex');
const signal = () => new AbortController().signal;
const jwt = (identity = account, expiry = now + 3600000) => [Buffer.from('{"alg":"fixture"}').toString('base64url'),
  Buffer.from(JSON.stringify({exp:expiry/1000,'https://api.openai.com/auth':{chatgpt_account_id:identity}})).toString('base64url'), 'fixture'].join('.');
const lease = () => ({ accessToken: jwt(), chatgptAccountId: account, expiresAt: now+3600000, chatgptPlanType: 'fixture-plan' });
const make = provider => new ExternalTokenAuth(provider, { expectedAccountSha256: pin, now: () => now });

test('initial external login emits only the official access-token fields from a pinned host lease', async () => {
  const seen = [], auth = make(async (previous, s) => { seen.push([previous,s.aborted]); return lease(); });
  const value = await auth.login(signal());
  assert.equal(value.type,'chatgptAuthTokens'); assert.equal(value.chatgptAccountId,account);
  assert.deepEqual(Object.keys(value).sort(),['accessToken','chatgptAccountId','chatgptPlanType','type']);
  assert.deepEqual(seen,[[null,false]]); assert(!('refreshToken' in value) && !('expiresAt' in value));
});

test('mismatched refresh account refuses before contacting host and matching refresh preserves account', async () => {
  let calls=0; const auth=make(async () => {calls++; return lease();});
  await auth.login(signal());
  await assert.rejects(auth.serverRequest({method:'account/chatgptAuthTokens/refresh',params:{previousAccountId:'other-account'}},signal()));
  assert.equal(calls,1);
  const value=await auth.serverRequest({method:'account/chatgptAuthTokens/refresh',params:{previousAccountId:account}},signal());
  assert.equal(calls,2);assert.equal(value.chatgptAccountId,account);assert(!('type' in value));
});

test('uninitialized refresh, permissions and concurrent refreshes never issue a second lease', async () => {
  let resolve; const auth=make(async () => lease());
  await assert.rejects(auth.serverRequest({method:'account/chatgptAuthTokens/refresh',params:{}},signal()));
  await auth.login(signal());
  await assert.rejects(auth.serverRequest({method:'item/permissions/requestApproval',params:{}},signal()));
  let calls=0; const busy=make(async () => ++calls===1 ? lease() : new Promise(r=>{resolve=r;}));
  await busy.login(signal());const first=busy.serverRequest({method:'account/chatgptAuthTokens/refresh',params:{}},signal());
  await assert.rejects(busy.serverRequest({method:'account/chatgptAuthTokens/refresh',params:{}},signal()));
  assert.equal(calls,2);resolve(lease());await first;
});

test('expired, inconsistent and wrong-account leases fail closed without exposing token diagnostics', async () => {
  const changes=[{expiresAt:now}, {accessToken:jwt('other-account')}, {chatgptAccountId:'other-account'},
    {expiresAt:now+3600001}, {accessToken:jwt()+'\r\n'}, {chatgptPlanType:'bad\nplan'}, {accessToken:'not-a-valid-jwt-token'}];
  for(const change of changes){
    const auth=make(async()=>({...lease(),...change}));
    await assert.rejects(auth.login(signal()),error=>{assert(!String(error).includes('fixture-account'));return true;});
  }
  await assert.rejects(make(async()=>{throw Error('synthetic-private-diagnostic');}).login(signal()),error=>{
    assert(!String(error).includes('synthetic-private'));return true;
  });
});

test('cancellation before or during host lease acquisition never returns a credential', async () => {
  let calls=0;const controller=new AbortController();controller.abort();
  await assert.rejects(make(async()=>{calls++;return lease();}).login(controller.signal));assert.equal(calls,0);
  let finish;const pendingController=new AbortController();const auth=make(async()=>new Promise(resolve=>{finish=resolve;}));
  const pending=auth.login(pendingController.signal);pendingController.abort();finish(lease());await assert.rejects(pending);
});

test('private account pin is mandatory and token-expiry bounds cannot become unlimited', () => {
  for(const options of [{expectedAccountSha256:''},{expectedAccountSha256:pin,minimumRemainingMs:Infinity},
    {expectedAccountSha256:pin,minimumRemainingMs:0}])assert.throws(()=>new ExternalTokenAuth(async()=>lease(),options));
});
