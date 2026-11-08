# Proposed Cloudflare WSS Route — Not Applied

**Status:** Prepared only. No DNS, tunnel ingress, WAF or Access change applied.

## Existing PinLab tunnel

The host systemd unit `cloudflared-pinlab.service` runs a remote-managed
Cloudflare Tunnel from a token file. Existing ingress configuration observed in
the service journal:

```json
{
  "ingress": [
    {"hostname": "pinlab-pm.picopiece.com", "service": "http://127.0.0.1:8888"},
    {"hostname": "pinlab-app.picopiece.com", "service": "http://127.0.0.1:8890"},
    {"service": "http_status:404"}
  ],
  "warp-routing": {"enabled": false}
}
```

This confirms cloudflared runs on the same host/network namespace as the
loopback services, so `http://127.0.0.1:9001` is a valid origin candidate.

## Proposed addition only

```json
{"hostname": "mqtt-pinlab.picopiece.com", "service": "http://127.0.0.1:9001"}
```

Required additional DNS entry:

```text
CNAME mqtt-pinlab -> <PINLAB_TUNNEL_UUID>.cfargotunnel.com (proxied)
```

The Cloudflare dashboard normally creates this CNAME when the public hostname is
added to the tunnel. A single-label `mqtt-pinlab` hostname is expected to be
covered by the existing `*.picopiece.com` Universal SSL certificate; verify the
public certificate after approval.

## Must not change

- `pinlab-app.picopiece.com` → `127.0.0.1:8890`
- `pinlab-pm.picopiece.com` → `127.0.0.1:8888`
- Other cloudflared services on the host
- Ports `1883` and `8883` must not be published.

## Required CTO approval before applying

- hostname `mqtt-pinlab.picopiece.com`
- origin `http://127.0.0.1:9001`
- public exposure, authentication and no-interactive-Access decision

## Access decision

Interactive Cloudflare Access login is not suitable for headless ESP32 clients.
The proposed route therefore relies on Mosquitto per-device username/password
and topic ACLs, with anonymous access disabled and connection/packet limits.
If Cloudflare Access is required later, a Cloudflare service token would need
to be added to the ESP32 WebSocket handshake (custom headers); that compatibility
is not yet verified. Do not enable interactive Access.

## Post-approval validation

1. Confirm DNS CNAME is proxied.
2. Confirm public certificate for `mqtt-pinlab.picopiece.com`.
3. Test WebSocket upgrade `wss://mqtt-pinlab.picopiece.com/mqtt`.
4. Authenticate as `gw-000001` and publish QoS 1 to:
   `pinlab/v1/gateways/GW-000001/telemetry`
5. Confirm the existing consumer persists a SIMULATED sample.
6. Confirm wrong/anonymous credentials are rejected.
7. Confirm existing app and OpenProject URLs remain healthy.

## Applied status — 2026-11-08

CTO applied the route. Observed cloudflared configuration version 6:

```text
mqtt-pinlab.picopiece.com → http://127.0.0.1:9001
```

External WSS `wss://mqtt-pinlab.picopiece.com/mqtt` was verified with paho,
TLS hostname/CA verification, authenticated QoS 1 publish and dev PostgreSQL
persistence. Existing `pinlab-app` and `pinlab-pm` routes remained 200.
