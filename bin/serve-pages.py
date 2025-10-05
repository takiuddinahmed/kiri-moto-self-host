#!/usr/bin/env python3
"""Lightweight static file server for locally previewing the Cloudflare Pages build."""

import argparse
import contextlib
import http.server
import os
import socketserver
import sys
from pathlib import Path

DEFAULT_PORT = 5003
DEFAULT_ROOT = Path(__file__).resolve().parent.parent / "dist-pages"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--port",
        "-p",
        type=int,
        default=DEFAULT_PORT,
        help=f"Port to bind (default: {DEFAULT_PORT})",
    )
    parser.add_argument(
        "--root",
        "-r",
        type=Path,
        default=DEFAULT_ROOT,
        help=f"Directory to serve (default: {DEFAULT_ROOT})",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.root.resolve()

    if not root.exists():
        print(f"error: directory '{root}' does not exist", file=sys.stderr)
        return 1
    if not root.is_dir():
        print(f"error: '{root}' is not a directory", file=sys.stderr)
        return 1

    os.chdir(root)

    class PagesRequestHandler(http.server.SimpleHTTPRequestHandler):
        # ensure wasm files get correct MIME type for browsers
        extensions_map = {
            **http.server.SimpleHTTPRequestHandler.extensions_map,
            ".wasm": "application/wasm",
            ".mjs": "text/javascript",
        }

        def end_headers(self) -> None:
            # avoid caching during local development sessions
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            self.send_header(
                "Permissions-Policy",
                "accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), cross-origin-isolated=(), document-domain=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), web-share=(), xr-spatial-tracking=(), unload=(self), webgl=(self)"
            )
            self.send_header("Cross-Origin-Opener-Policy", "same-origin")
            self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
            super().end_headers()

    class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
        allow_reuse_address = True

    with contextlib.ExitStack() as stack:
        server = ThreadingTCPServer(("127.0.0.1", args.port), PagesRequestHandler)
        stack.enter_context(server)
        print(f"Serving {root} at http://127.0.0.1:{args.port}/ (Ctrl+C to stop)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down...")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
