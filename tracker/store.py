"""The tracker's memory. It is only ever read and written through the EZ Wallet backend API,
never by connecting to the database."""
import time
from collections.abc import Callable

import httpx

from .errors import AuthError, RetriesExhausted, TransientError
from .http_errors import TRANSPORT_ERRORS, raise_for_service, transport_error
from .retry import RetryPolicy, call_with_retries
from .tracer import Tracer


class ApiStore:
    def __init__(self, base_url: str, login: str, password: str, retry: RetryPolicy, tracer: Tracer,
                 client: httpx.Client | None = None, sleep: Callable[[float], None] = time.sleep):
        self.base = base_url.rstrip("/")
        self._login_id, self._password = login, password
        self.retry, self.tracer, self.sleep = retry, tracer, sleep
        self.client = client or httpx.Client(timeout=60)
        self.token: str | None = None
        self.retries = 0

    # -- transport ---------------------------------------------------------
    def _once(self, method: str, path: str, json=None, auth: bool = True) -> httpx.Response:
        headers = {"Authorization": f"Bearer {self.token}"} if auth and self.token else {}
        try:
            resp = self.client.request(method, self.base + path, json=json, headers=headers)
        except TRANSPORT_ERRORS as e:
            raise transport_error("backend", e) from e
        except httpx.TimeoutException as e:
            raise TransientError(f"backend: timed out ({type(e).__name__})") from e
        if resp.status_code == 401 and auth and path != "/api/v1/auth/login":
            self._login_once()  # token expired or revoked: log in again, once
            headers = {"Authorization": f"Bearer {self.token}"}
            resp = self.client.request(method, self.base + path, json=json, headers=headers)
        raise_for_service("backend", resp)
        return resp

    def _call(self, method: str, path: str, json=None, auth: bool = True, tool: str | None = None) -> httpx.Response:
        t0 = time.monotonic()
        status = "ok"
        note = None

        def on_retry(n, delay, err):
            self.retries += 1
            self.tracer.log(step=None, kind="state", service="backend", tool=tool or path, status="retry",
                            latency_ms=int((time.monotonic() - t0) * 1000), note=f"retry {n} in {delay:.1f}s: {err}")

        try:
            return call_with_retries(lambda: self._once(method, path, json, auth), self.retry, label="backend",
                                     on_retry=on_retry, sleep=self.sleep)
        except Exception as e:  # noqa: BLE001
            status, note = "error", f"{type(e).__name__}: {e}"
            raise
        finally:
            self.tracer.log(step=None, kind="state", service="backend", tool=tool or f"{method} {path}",
                            status=status, latency_ms=int((time.monotonic() - t0) * 1000), note=note)

    # -- API ---------------------------------------------------------------
    def wake(self, max_seconds: float = 150) -> None:
        """Free hosting sleeps when idle; poll the health check until it answers."""
        t0 = time.monotonic()
        while True:
            try:
                r = self.client.get(self.base + "/api/v1/health", timeout=20)
                if r.status_code == 200:
                    self.tracer.log(step=None, kind="state", service="backend", tool="GET /api/v1/health", status="ok",
                                    latency_ms=int((time.monotonic() - t0) * 1000))
                    return
            except (*TRANSPORT_ERRORS, httpx.TimeoutException):
                pass
            if time.monotonic() - t0 > max_seconds:
                self.tracer.log(step=None, kind="state", service="backend", tool="GET /api/v1/health", status="error",
                                latency_ms=int((time.monotonic() - t0) * 1000), note="backend did not wake up")
                raise RetriesExhausted(f"backend: {self.base} did not respond within {max_seconds:.0f}s. Is it up? Is TRACKER_API_URL right?")
            self.sleep(5)

    def _login_once(self) -> None:
        resp = self.client.post(self.base + "/api/v1/auth/login", json={"identifier": self._login_id, "password": self._password})
        if resp.status_code in (400, 401):
            raise AuthError("backend: login failed. Check TRACKER_LOGIN / TRACKER_PASSWORD in tracker/.env.local.")
        raise_for_service("backend", resp)
        self.token = resp.json()["access_token"]

    def login(self) -> None:
        self._call_login()

    def _call_login(self) -> None:
        t0 = time.monotonic()
        try:
            call_with_retries(self._login_once, self.retry, label="backend login", sleep=self.sleep)
            status = "ok"
        except Exception:
            status = "error"
            raise
        finally:
            self.tracer.log(step=None, kind="state", service="backend", tool="POST /api/v1/auth/login", status=status,
                            latency_ms=int((time.monotonic() - t0) * 1000))

    def state(self) -> dict:
        return self._call("GET", "/api/v1/tracker/state", tool="load_state").json()

    def start_run(self, topic: str, k: int) -> int:
        return self._call("POST", "/api/v1/tracker/runs", json={"topic": topic, "k": k}, tool="start_run").json()["id"]

    def finish_run(self, run_id: int, payload: dict) -> dict:
        return self._call("POST", f"/api/v1/tracker/runs/{run_id}/finish", json=payload, tool="save_run").json()

    def reset(self) -> None:
        self._call("DELETE", "/api/v1/tracker/state", tool="reset_state")

    def attach_report(self, run_id: int, report_md: str) -> None:
        self._call("PUT", f"/api/v1/tracker/runs/{run_id}/report", json={"report_md": report_md}, tool="attach_report")
