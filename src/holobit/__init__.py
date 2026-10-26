import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

STATIC_DIR = Path(__file__).parent / "static"
# The app is served under this path, e.g. http://host:8000/holobit/.
PREFIX = "/holobit"


class StaticHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.route():
            super().do_GET()

    def do_HEAD(self) -> None:
        if self.route():
            super().do_HEAD()

    # Serves files under PREFIX, with the prefix dropped; returns False if
    # it has already answered.
    def route(self) -> bool:
        path = self.path.split("?", 1)[0]
        if path == PREFIX:
            # Relative links need the trailing slash.
            self.send_response(301)
            self.send_header("Location", PREFIX + "/")
            self.end_headers()
            return False
        if not path.startswith(PREFIX + "/"):
            self.send_error(404)
            return False
        self.path = self.path[len(PREFIX) :]
        return True

    def end_headers(self) -> None:
        # Always serve the latest files while we iterate on the simulator.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    handler = partial(StaticHandler, directory=STATIC_DIR)
    with ThreadingHTTPServer((host, port), handler) as server:
        print(f"Serving {STATIC_DIR} at http://{host}:{port}{PREFIX}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
