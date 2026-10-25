import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class HelloHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        body = b"Hello, World!\n"
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    with ThreadingHTTPServer((host, port), HelloHandler) as server:
        print(f"Serving on http://{host}:{port}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
