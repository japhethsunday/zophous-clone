"""Tiny status page for hosts that need an open port (Hugging Face Spaces).

GET any path -> {"ok": true, "uptime_s": ..., "jobs_done": ..., ...}
No secrets or job data are exposed.
"""

from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE = {"started": time.time(), "jobs_done": 0, "jobs_failed": 0, "last_job_at": None, "busy": False}


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        body = json.dumps({
            "ok": True,
            "service": "cloudnivo-clipping-worker",
            "uptime_s": int(time.time() - STATE["started"]),
            "busy": STATE["busy"],
            "jobs_done": STATE["jobs_done"],
            "jobs_failed": STATE["jobs_failed"],
            "last_job_at": STATE["last_job_at"],
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


def serve_in_background(port: int) -> None:
    server = ThreadingHTTPServer(("0.0.0.0", port), _Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
