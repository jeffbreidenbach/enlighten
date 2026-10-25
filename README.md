# holobit

A minimal "Hello World" web server, managed with [uv](https://docs.astral.sh/uv/).

## Run

```bash
uv run holobit
```

The server listens on all interfaces (`0.0.0.0`) on port 8000, so visit http://localhost:8000 or http://<this-machine-ip>:8000. Set `HOST` / `PORT` env vars to change the bind address.
