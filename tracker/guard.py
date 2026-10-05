"""Fetch guardrail. Every check here runs BEFORE any request leaves the machine.

  * scheme must be in config (http/https); no embedded credentials; sane ports
  * host must match the allow/deny patterns
  * every address the host resolves to must be a global unicast address:
    loopback, private, link-local (incl. cloud metadata 169.254.169.254),
    carrier-grade NAT, multicast, reserved and unspecified ranges are refused
  * the request is then pinned to the address we validated (no second DNS
    lookup that a hostile resolver could answer differently) and every
    redirect hop is validated again
"""
import fnmatch
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit

from .config import FetchPolicy
from .errors import GuardError, TransientError


@dataclass(frozen=True)
class Target:
    url: str
    scheme: str
    host: str
    port: int
    ip: str  # the validated address the request is pinned to


def ip_is_blocked(addr: str) -> bool:
    ip = ipaddress.ip_address(addr.split("%")[0])
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped:
            return ip_is_blocked(str(ip.ipv4_mapped))
        if ip.sixtofour:
            return ip_is_blocked(str(ip.sixtofour))
        if ip.teredo:
            return True
    return (not ip.is_global) or ip.is_multicast or ip.is_loopback or ip.is_link_local or ip.is_private


def _matches(host: str, patterns: tuple[str, ...]) -> bool:
    return any(fnmatch.fnmatch(host, p) for p in patterns)


def resolve(host: str, port: int) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        # DNS failing is a network problem (retryable), not a policy rejection.
        raise TransientError(f"DNS lookup failed for {host}: {e}") from e
    return list(dict.fromkeys(i[4][0] for i in infos))


def check_url(url: str, policy: FetchPolicy) -> Target:
    if not isinstance(url, str) or not url.strip() or len(url) > 2048:
        raise GuardError("empty or oversized URL")
    if any(ord(c) < 0x21 or ord(c) == 0x7F for c in url):
        raise GuardError("URL contains whitespace or control characters")
    try:
        p = urlsplit(url)
        port = p.port
    except ValueError as e:
        raise GuardError(f"malformed URL ({e})") from e
    scheme = p.scheme.lower()
    if scheme not in policy.allowed_schemes:
        raise GuardError(f"scheme '{scheme or '(none)'}' is not allowed (only {', '.join(policy.allowed_schemes)})")
    if p.username is not None or p.password is not None:
        raise GuardError("URLs with embedded credentials are not allowed")
    host = (p.hostname or "").lower().rstrip(".")
    if not host:
        raise GuardError("URL has no host")
    port = port or (443 if scheme == "https" else 80)
    if port not in policy.allowed_ports:
        raise GuardError(f"port {port} is not allowed")
    if _matches(host, policy.blocked_hosts):
        raise GuardError(f"host '{host}' is on the block list")
    if not _matches(host, policy.allowed_hosts):
        raise GuardError(f"host '{host}' is not on the allow list")

    addrs = resolve(host, port)
    if not addrs:
        raise TransientError(f"DNS returned no addresses for {host}")
    for a in addrs:
        if ip_is_blocked(a):
            raise GuardError(f"host '{host}' resolves to a non-public address ({a}); refusing to connect")
    return Target(url=url, scheme=scheme, host=host, port=port, ip=addrs[0])
