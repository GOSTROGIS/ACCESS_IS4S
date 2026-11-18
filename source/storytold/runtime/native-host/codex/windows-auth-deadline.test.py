"""Synthetic RPC deadline cases. These tests never read the real credential store."""
from hashlib import sha256
import importlib.util
import io
from pathlib import Path
import queue
import threading
import time
from types import SimpleNamespace
import unittest

spec=importlib.util.spec_from_file_location('managed_auth_deadline',Path(__file__).with_name('windows-auth-manager.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DeadlineTests(unittest.TestCase):
    def source(self):
        value=module.ManagedAuthManager.__new__(module.ManagedAuthManager)
        value.lock=threading.Lock()
        value.closed=False
        value.overflow=threading.Event()
        value.process=SimpleNamespace(poll=lambda:None)
        value.counter=0
        value.captured=0
        value.capture_lock=threading.Lock()
        value.replies=queue.Queue()
        value.sent=[]
        value._send=lambda message:value.sent.append(message)
        return value

    def test_cancelled_credential_never_starts_an_auth_rpc(self):
        source=self.source()
        cancelled=threading.Event()
        cancelled.set()
        with self.assertRaises(module.ManagedAuthError):
            source.credential('0'*64,deadline=time.monotonic()+1,cancelled_event=cancelled)
        self.assertEqual(source.sent,[])

    def test_locked_account_call_respects_one_shared_deadline(self):
        source=self.source()
        source.lock.acquire()
        before=time.monotonic()
        try:
            with self.assertRaises(module.ManagedAuthError):
                source.credential('0'*64,deadline=before+.04)
        finally:
            source.lock.release()
        self.assertLess(time.monotonic()-before,.5)
        self.assertEqual(source.sent,[])

    def test_cancelled_reply_is_not_returned_to_the_lease_caller(self):
        source=self.source()
        cancelled=threading.Event()
        class RevokeOnRead:
            def get(self,**unused):
                cancelled.set()
                return {'id':1,'result':{'syntheticLease':'must-never-leave-the-rpc'}}
        source.replies=RevokeOnRead()
        with self.assertRaises(module.ManagedAuthError):
            source._request('getAuthStatus',{},deadline=time.monotonic()+1,cancelled_event=cancelled)
        self.assertEqual(len(source.sent),1)

    def test_timed_out_rpc_late_reply_cannot_satisfy_a_later_request(self):
        source=self.source()
        with self.assertRaises(module.ManagedAuthError):
            source._request('getAuthStatus',{},deadline=time.monotonic()+.025)
        def reply(message):
            source.replies.put({'id':1,'result':{'syntheticLease':'late-secret-fixture'}})
            source.replies.put({'id':message['id'],'result':{'account':'current-fixture'}})
        source._send=reply
        self.assertEqual(source._request('account/read',{},deadline=time.monotonic()+1),{'account':'current-fixture'})

    def test_expired_budget_after_validation_never_returns_a_lease(self):
        source=self.source()
        account='synthetic-account'
        expected=sha256(account.encode()).hexdigest()
        source._request=lambda *args,**kwargs: {}
        def validate(*args,**kwargs):
            time.sleep(.03)
            return {'chatgptAccountId':account,'accessToken':'synthetic-fixture-not-a-credential','expiresAt':time.time()*1000+600000}
        source._lease=validate
        with self.assertRaises(module.ManagedAuthError):
            source.credential(expected,deadline=time.monotonic()+.015)

    def test_valid_separate_transactions_do_not_exhaust_a_lifetime_output_counter(self):
        source=self.source()
        # Each completed transaction is below the same four-MiB output limit.
        # A persistent manager must continue working after aggregate traffic
        # exceeds that limit, without increasing its per-transaction allowance.
        chunk=(b'ordinary synthetic provider diagnostic ' + b'x'*1000 + b'\n')*1800
        self.assertLess(len(chunk),4*1024*1024)
        for unused in range(3):
            with source._guard(time.monotonic()+1):
                source._read(io.BytesIO(chunk),False)
                self.assertFalse(source.overflow.is_set())
        self.assertGreater(len(chunk)*3,4*1024*1024)

    def test_one_oversized_transaction_remains_terminal_across_later_calls(self):
        source=self.source()
        chunk=(b'x'*1023+b'\n')*4097
        with source._guard(time.monotonic()+1):
            source._read(io.BytesIO(chunk),False)
        self.assertTrue(source.overflow.is_set())
        with self.assertRaises(module.ManagedAuthError):
            with source._guard(time.monotonic()+1):
                source._request('getAuthStatus',{},deadline=time.monotonic()+.02)
        self.assertTrue(source.overflow.is_set())

    def test_an_oversized_single_protocol_line_is_still_refused(self):
        source=self.source()
        with source._guard(time.monotonic()+1):
            source._read(io.BytesIO(b'x'*(1024*1024+1)),True)
        self.assertTrue(source.overflow.is_set())
        self.assertTrue(source.replies.empty())


if __name__=='__main__':
    unittest.main()
