import os
import secrets
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

STATIC_DIR = Path(__file__).parent / "static"
# The app is served only under a random, unguessable path, kept out of the
# repo in this file (in the directory the server runs from) so it survives
# restarts. HOLOBIT_PATH overrides it.
SECRET_FILE = Path(".secret-path")
ROBOTS = b"User-agent: *\nDisallow: /\n"


def secret_path() -> str:
    if path := os.environ.get("HOLOBIT_PATH"):
        return path.strip("/")
    if not SECRET_FILE.exists():
        SECRET_FILE.write_text(secrets.token_urlsafe(12) + "\n")
    return SECRET_FILE.read_text().strip()


class StaticHandler(SimpleHTTPRequestHandler):
    """Serves the static files under /<prefix>/ and nothing else, apart
    from a robots.txt asking crawlers to stay away."""

    prefix = ""

    def do_GET(self) -> None:
        if self.route():
            super().do_GET()

    def do_HEAD(self) -> None:
        if self.route():
            super().do_HEAD()

    # Returns whether to serve self.path (rewritten to drop the prefix);
    # otherwise it has already answered.
    def route(self) -> bool:
        path = self.path.split("?", 1)[0]
        if path == "/robots.txt":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(ROBOTS)))
            self.end_headers()
            if self.command == "GET":
                self.wfile.write(ROBOTS)
            return False
        if path == f"/{self.prefix}":
            # Relative links need the trailing slash.
            self.send_response(301)
            self.send_header("Location", f"/{self.prefix}/")
            self.end_headers()
            return False
        if not path.startswith(f"/{self.prefix}/"):
            self.send_error(404)
            return False
        self.path = self.path[len(self.prefix) + 1 :]
        return True

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self) -> None:
        # Always serve the latest files, and ask search engines not to index.
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        super().end_headers()


def main() -> None:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    prefix = secret_path()
    handler = partial(type("Handler", (StaticHandler,), {"prefix": prefix}), directory=STATIC_DIR)
    with ThreadingHTTPServer((host, port), handler) as server:
        print(f"Serving {STATIC_DIR} at http://{host}:{port}/{prefix}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
