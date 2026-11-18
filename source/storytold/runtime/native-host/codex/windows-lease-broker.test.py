"""Actual loopback HTTP boundaries with synthetic peer/session/access sentinels.

No Windows credential store, SSH guest, provider account, or model is used.
"""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import http.client
import importlib.util
import io
import json
import os
from pathlib import Path
import secrets
import socket
import threading
import time
import unittest

here=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('native_lease_broker',here/'windows-lease-broker.py')
broker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(broker)
SENTINEL='synthetic.access.lease.sentinel.000000000000000000000000'
SESSION='a'*64
ACCOUNTS={'access':'synthetic-access-account','slipcurve':'synthetic-slipcurve-account'}
PINS={name:sha256(value.encode()).hexdigest() for name,value in ACCOUNTS.items()}


class Peers:
    def __init__(self):
        self.allowed=True
        self.calls=[]
        self.registrations=[]
        self.products={'access','slipcurve'}
    def accepts(self,product,client,server):
        self.calls.append((product,client,server))
        return self.allowed and product in self.products
    def register(self,product,pid):
        self.registrations.append(('register',product,pid))
    def unregister(self,product,pid):
        self.registrations.append(('unregister',product,pid))


class Auth:
    def __init__(self):
        self.calls=[]
        self.started=threading.Event()
        self.release=threading.Event()
        self.release.set()
        self.mutate=None
    def credential(self,pin,previous,*,deadline,cancelled_event):
        assert isinstance(deadline,float) and deadline>time.monotonic()
        assert isinstance(cancelled_event,threading.Event) and not cancelled_event.is_set()
        self.calls.append((pin,previous))
        self.started.set()
        self.release.wait(2)
        account=next(value for product,value in ACCOUNTS.items() if PINS[product]==pin)
        value={'accessToken':SENTINEL,'chatgptAccountId':account,'expiresAt':int(time.time()*1000+600000),'chatgptPlanType':'synthetic'}
        if self.mutate:
            self.mutate(value)
        return value


class Sessions:
    def __init__(self):
        self.calls=[]
        self.allowed=True
        self.error=False
    def __call__(self,product,session,deadline,cancelled):
        self.calls.append((product,session))
        if self.error:
            raise ValueError(SENTINEL)
        return self.allowed and session==SESSION and not cancelled.is_set() and time.monotonic()<deadline


class ObservedHandler(broker.LeaseHandler):
    def _reply(self,status,body=broker.ERROR,**options):
        self.server.attempts.append(status)
        return super()._reply(status,body,**options)


class Boundaries(unittest.TestCase):
    def setUp(self):
        self.peers=Peers()
        self.auth=Auth()
        self.sessions=Sessions()
        self.server=broker.LeaseBroker(self.peers,self.auth,PINS,self.sessions,budget_seconds=.7)
        self.server.RequestHandlerClass=ObservedHandler
        self.server.attempts=[]
        self.thread=threading.Thread(target=self.server.serve_forever,kwargs={'poll_interval':.01},daemon=True)
        self.thread.start()

    def tearDown(self):
        self.auth.release.set()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.assertFalse(self.thread.is_alive())

    def body(self,product='access',**changes):
        value={'product':product,'requestId':secrets.token_urlsafe(32),'expiresAt':int(time.time()*1000+10000),'sessionSha256':SESSION}
        value.update(changes)
        return value

    def request(self,value=None,*,path='/v1/lease/access',headers=None,method='POST',raw=None):
        client=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=2)
        content=raw if raw is not None else json.dumps(self.body() if value is None else value).encode()
        try:
            client.request(method,path,body=content,headers={'Content-Type':'application/json',**(headers or {})})
            response=client.getresponse()
            data=response.read()
            return response.status,dict(response.getheaders()),data
        except (http.client.RemoteDisconnected,ConnectionResetError):
            return 0,{},b''
        finally:
            client.close()

    def refused(self,result,status=403):
        self.assertEqual(result[0],status)
        self.assertEqual(result[2],broker.ERROR)
        self.assertEqual(result[1].get('Cache-Control'),'no-store')
        self.assertNotIn(SENTINEL.encode(),result[2])

    def test_valid_products_return_only_exact_in_memory_lease_and_no_store(self):
        for product in ACCOUNTS:
            with self.subTest(product=product):
                result=self.request(self.body(product),path='/v1/lease/'+product)
                self.assertEqual(result[0],200)
                self.assertEqual(result[1]['Cache-Control'],'no-store')
                self.assertEqual(result[1]['Pragma'],'no-cache')
                self.assertEqual(result[1]['Connection'],'close')
                lease=json.loads(result[2])
                self.assertEqual(set(lease),{'accessToken','chatgptAccountId','expiresAt','chatgptPlanType'})
                self.assertEqual(lease['chatgptAccountId'],ACCOUNTS[product])
                self.assertEqual(lease['accessToken'],SENTINEL)
        self.assertEqual(len(self.sessions.calls),4)
        self.assertGreaterEqual(len(self.peers.calls),4)
        for product in ACCOUNTS:
            self.assertGreaterEqual(sum(call[0]==product for call in self.peers.calls),2)

    def test_unregistered_or_cross_product_peers_never_reach_auth(self):
        self.peers.allowed=False
        self.refused(self.request())
        self.assertFalse(self.auth.calls)
        self.assertFalse(self.sessions.calls)
        self.peers.allowed=True
        self.peers.products={'access'}
        self.refused(self.request(self.body('slipcurve'),path='/v1/lease/slipcurve'))
        self.assertFalse(self.auth.calls)

    def test_unauthorized_peer_cannot_consume_an_authorized_request_nonce(self):
        value=self.body()
        self.peers.allowed=False
        self.refused(self.request(value))
        self.peers.allowed=True
        self.assertEqual(self.request(value)[0],200)
        self.assertEqual(len(self.auth.calls),1)

    def test_routes_methods_and_http_cannot_register_peers(self):
        for path in ['/register','/v1/lease/other','/v1/lease/access/','/v1/lease/access?x=1','http://127.0.0.1/v1/lease/access']:
            with self.subTest(path=path):
                self.refused(self.request(path=path))
        for method in ['GET','PUT','DELETE','OPTIONS','PATCH']:
            self.refused(self.request(method=method),405)
        self.assertFalse(self.peers.registrations)
        self.assertFalse(self.auth.calls)

    def test_origin_host_ambient_credentials_and_transfer_headers_are_refused(self):
        for headers in [{'Host':'localhost:'+str(self.server.server_port)},{'Origin':'null'},{'Origin':'https://foreign.invalid'},
                        {'Authorization':'Bearer '+SENTINEL},{'Cookie':'sentinel=value'},{'Transfer-Encoding':'chunked'},
                        {'Content-Type':'text/plain'},{'Expect':'100-continue'}]:
            with self.subTest(headers=tuple(headers)):
                self.refused(self.request(headers=headers))
        self.assertFalse(self.auth.calls)

    def test_duplicate_http_length_host_or_content_type_is_refused_before_auth(self):
        content=json.dumps(self.body()).encode()
        for duplicate in ['Host','Content-Length','Content-Type']:
            client=socket.create_connection(('127.0.0.1',self.server.server_port),timeout=1)
            try:
                headers=[('Host',f'127.0.0.1:{self.server.server_port}'),('Content-Type','application/json'),('Content-Length',str(len(content)))]
                headers.extend([pair for pair in headers if pair[0]==duplicate])
                raw='POST /v1/lease/access HTTP/1.1\r\n'+''.join(f'{key}: {value}\r\n' for key,value in headers)+'\r\n'
                client.sendall(raw.encode()+content)
                response=http.client.HTTPResponse(client)
                response.begin()
                self.assertEqual(response.status,403)
                self.assertEqual(response.read(),broker.ERROR)
                self.assertFalse(self.auth.calls)
            finally:
                client.close()

    def test_header_drips_cannot_renew_connection_budget_or_hold_all_slots(self):
        clients=[]
        try:
            for _ in range(8):
                client=socket.create_connection(('127.0.0.1',self.server.server_port),timeout=1)
                client.sendall(b'POST /v1/lease/access HTTP/1.1\r\nX-Delay: ')
                clients.append(client)
            for _ in range(5):
                threading.Event().wait(.2)
                for client in clients:
                    try:
                        client.sendall(b'a')
                    except OSError:
                        pass
            self.assertFalse(self.auth.calls)
            self.assertEqual(self.request()[0],200)
        finally:
            for client in clients:
                client.close()

    def test_strict_payload_types_unknown_fields_duplicate_json_and_bounds(self):
        bad=[self.body(product='slipcurve'),self.body(unknown='value'),self.body(expiresAt=True),self.body(expiresAt=int(time.time()*1000-1)),
             self.body(expiresAt=int(time.time()*1000+100000)),self.body(sessionSha256='foreign'),self.body(requestId='short'),
             self.body(previousChatgptAccountId=''),self.body(previousChatgptAccountId='line\nbreak'),[]]
        for value in bad:
            with self.subTest(kind=type(value).__name__,keys=tuple(value) if isinstance(value,dict) else ()):
                self.refused(self.request(value))
        for raw in [b'{"product":"access","product":"access"}',b'\xff',b'not-json',b'x'*4097]:
            self.refused(self.request(raw=raw))
        self.assertFalse(self.auth.calls)

    def test_truncated_body_eof_is_refused_before_authorization(self):
        content=json.dumps(self.body()).encode()
        client=socket.create_connection(('127.0.0.1',self.server.server_port),timeout=1)
        try:
            client.sendall((f'POST /v1/lease/access HTTP/1.1\r\nHost: 127.0.0.1:{self.server.server_port}\r\nContent-Type: application/json\r\nContent-Length: {len(content)}\r\n\r\n').encode()+content[:len(content)//2])
            client.shutdown(socket.SHUT_WR)
            response=http.client.HTTPResponse(client)
            response.begin()
            self.assertEqual(response.status,403)
            self.assertEqual(response.read(),broker.ERROR)
            self.assertFalse(self.auth.calls)
        finally:
            client.close()

    def test_nonce_replay_is_refused_after_success_and_after_failed_authorization(self):
        value=self.body()
        self.assertEqual(self.request(value)[0],200)
        self.refused(self.request(value))
        self.assertEqual(len(self.auth.calls),1)
        value=self.body()
        self.sessions.allowed=False
        self.refused(self.request(value))
        self.sessions.allowed=True
        self.refused(self.request(value))
        self.assertEqual(len(self.auth.calls),1)

    def test_same_nonce_concurrency_allows_exactly_one_authorization(self):
        self.auth.release.clear()
        value=self.body()
        with ThreadPoolExecutor(max_workers=2) as pool:
            first=pool.submit(self.request,value)
            self.assertTrue(self.auth.started.wait(.5))
            second=pool.submit(self.request,value)
            self.refused(second.result(timeout=1))
            self.auth.release.set()
            self.assertEqual(first.result(timeout=1)[0],200)
        self.assertEqual(len(self.auth.calls),1)

    def test_different_nonce_clients_wait_for_the_one_bounded_authorization_slot(self):
        self.auth.release.clear()
        with ThreadPoolExecutor(max_workers=2) as pool:
            first=pool.submit(self.request,self.body())
            self.assertTrue(self.auth.started.wait(.5))
            second=pool.submit(self.request,self.body('slipcurve'),path='/v1/lease/slipcurve')
            end=time.monotonic()+.4
            while len(self.peers.calls)<2 and time.monotonic()<end:time.sleep(.005)
            self.assertEqual(len(self.auth.calls),1)
            self.assertFalse(second.done(),'The other product must wait rather than fail a normal concurrent lease')
            self.auth.release.set()
            self.assertEqual(first.result(timeout=1)[0],200)
            self.assertEqual(second.result(timeout=1)[0],200)
        self.assertEqual(len(self.auth.calls),2)
        self.assertEqual({call[0] for call in self.auth.calls},set(self.server.account_pins.values()))

    def test_queued_client_deadline_does_not_start_auth_or_leak_the_slot(self):
        self.auth.release.clear()
        with ThreadPoolExecutor(max_workers=1) as pool:
            first=pool.submit(self.request,self.body())
            self.assertTrue(self.auth.started.wait(.5))
            self.server.budget_seconds=.08
            started=time.monotonic()
            second=self.request(self.body('slipcurve'),path='/v1/lease/slipcurve')
            self.assertEqual(second[0],0)
            self.assertLess(time.monotonic()-started,.4)
            self.assertEqual(len(self.auth.calls),1)
            self.auth.release.set()
            self.assertEqual(first.result(timeout=1)[0],200)
        self.server.budget_seconds=.7
        self.assertEqual(self.request()[0],200)
        self.assertEqual(len(self.auth.calls),2)

    def test_peer_revoked_while_queued_cannot_start_auth(self):
        self.auth.release.clear()
        with ThreadPoolExecutor(max_workers=2) as pool:
            first=pool.submit(self.request,self.body())
            self.assertTrue(self.auth.started.wait(.5))
            second=pool.submit(self.request,self.body('slipcurve'),path='/v1/lease/slipcurve')
            end=time.monotonic()+.4
            while len(self.peers.calls)<2 and time.monotonic()<end:time.sleep(.005)
            self.peers.products.remove('slipcurve')
            self.auth.release.set()
            self.assertEqual(first.result(timeout=1)[0],200)
            self.refused(second.result(timeout=1))
        self.assertEqual(len(self.auth.calls),1)

    def test_session_revocation_during_auth_refuses_lease(self):
        self.auth.mutate=lambda value:setattr(self.sessions,'allowed',False)
        self.refused(self.request())
        self.assertEqual(len(self.auth.calls),1)
        self.assertNotIn(200,self.server.attempts)

    def test_peer_revocation_during_auth_refuses_lease(self):
        self.auth.mutate=lambda value:setattr(self.peers,'allowed',False)
        self.refused(self.request())
        self.assertEqual(len(self.auth.calls),1)
        self.assertNotIn(200,self.server.attempts)

    def test_account_pin_previous_account_and_lease_shape_are_independently_checked(self):
        for mutate in [lambda v:v.update(chatgptAccountId='foreign-account'),lambda v:v.update(expiresAt=True),
                       lambda v:v.update(expiresAt=int(time.time()*1000)),lambda v:v.update(refreshToken=SENTINEL),
                       lambda v:v.update(accessToken='bad'),lambda v:v.update(chatgptPlanType='bad plan')]:
            self.auth.mutate=mutate
            self.refused(self.request())
        self.auth.mutate=None
        self.refused(self.request(self.body(previousChatgptAccountId='wrong-previous-account')))
        self.assertNotIn(200,self.server.attempts)

    def test_deadline_closes_request_and_never_writes_late_token(self):
        self.server.budget_seconds=.1
        self.auth.release.clear()
        started=time.monotonic()
        result=self.request()
        self.assertEqual(result[0],0)
        self.assertLess(time.monotonic()-started,.4)
        self.assertTrue(self.auth.started.is_set())
        self.auth.release.set()
        self.assertTrue(self.server._authorization.acquire(timeout=.5))
        self.server._authorization.release()
        self.assertNotIn(200,self.server.attempts)

    def test_short_client_expiry_cannot_be_extended_by_broker_budget(self):
        self.auth.release.clear()
        started=time.monotonic()
        result=self.request(self.body(expiresAt=int(time.time()*1000+90)))
        self.assertEqual(result[0],0)
        self.assertLess(time.monotonic()-started,.4)
        self.auth.release.set()
        self.assertTrue(self.server._authorization.acquire(timeout=.5))
        self.server._authorization.release()
        self.assertNotIn(200,self.server.attempts)

    def test_client_disconnect_cancels_and_never_writes_token(self):
        self.auth.release.clear()
        content=json.dumps(self.body()).encode()
        client=socket.create_connection(('127.0.0.1',self.server.server_port),timeout=1)
        client.sendall((f'POST /v1/lease/access HTTP/1.1\r\nHost: 127.0.0.1:{self.server.server_port}\r\nContent-Type: application/json\r\nContent-Length: {len(content)}\r\n\r\n').encode()+content)
        self.assertTrue(self.auth.started.wait(.5))
        client.close()
        self.auth.release.set()
        self.assertTrue(self.server._authorization.acquire(timeout=.5))
        self.server._authorization.release()
        # Peer/EOF is checked after the auth queue, before any token headers.
        for _ in range(100):
            if self.server._requests._value==8:
                break
            threading.Event().wait(.002)
        self.assertNotIn(200,self.server.attempts)

    def test_callback_error_is_generic_and_parent_control_has_no_http_equivalent(self):
        self.sessions.error=True
        self.refused(self.request())
        self.assertFalse(self.auth.calls)
        self.server.control({'action':'register','product':'access','pid':123})
        self.server.control({'action':'unregister','product':'access','pid':123})
        self.assertEqual(self.peers.registrations,[('register','access',123),('unregister','access',123)])
        for value in [{'action':'register','product':'other','pid':123},{'action':'register','product':'access','pid':True},
                      {'action':'register','product':'access','pid':123,'token':SENTINEL}]:
            with self.assertRaises(broker.Refused):
                self.server.control(value)

    def test_parent_private_binary_pipe_enrolls_only_fixed_commands_and_eof_stops_server(self):
        read_fd,write_fd=os.pipe()
        responses=io.BytesIO()
        with os.fdopen(read_fd,'rb') as reader,os.fdopen(write_fd,'wb') as writer:
            control=threading.Thread(target=self.server.serve_control,args=(reader,responses),daemon=True)
            control.start()
            writer.write(b'{"action":"register","product":"access","pid":123}\n')
            writer.write(b'{"action":"register","product":"access","pid":true}\n')
            writer.write(b'{"action":"unregister","product":"access","pid":123}\n')
            writer.flush()
            writer.close()
            control.join(timeout=1)
            self.assertFalse(control.is_alive())
        self.assertEqual(responses.getvalue(),b'{"ok":true}\n{"ok":false}\n{"ok":true}\n')
        self.assertEqual(self.peers.registrations,[('register','access',123),('unregister','access',123)])
        self.assertTrue(self.server._stopping.is_set())


if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(Boundaries)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    report={'ok':result.wasSuccessful(),'syntheticBoundaryTests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),
            'actualLoopbackHttp':True,'fakePeerSessionAndAccessSentinels':True,'productionSshTested':False,
            'realAuthManagerCalled':False,'credentialsSerialized':False,'modelJobs':0}
    print(json.dumps(report))
    raise SystemExit(0 if result.wasSuccessful() else 1)
