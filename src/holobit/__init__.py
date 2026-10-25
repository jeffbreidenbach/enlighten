import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

STATIC_DIR = Path(__file__).parent / "static"


class StaticHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        # Always serve the latest files while we iterate on the simulator.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    handler = partial(StaticHandler, directory=STATIC_DIR)
    with ThreadingHTTPServer((host, port), handler) as server:
        print(f"Serving {STATIC_DIR} on http://{host}:{port}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
