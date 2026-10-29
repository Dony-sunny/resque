"""Optional LAN TLS tests: install requirements-tls.txt to enable these checks."""
import importlib.util
import ipaddress
from pathlib import Path
import ssl
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
import pytest

crypto = pytest.importorskip("cryptography", reason="Install backend/requirements-tls.txt for private LAN TLS checks")
from cryptography import x509
from cryptography.x509.oid import ExtendedKeyUsageOID

spec = importlib.util.spec_from_file_location("create_demo_tls", Path(__file__).resolve().parents[2] / "scripts/create-demo-tls.py")
tls = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tls)


def test_certificate_exact_hosts_and_public_asset_only(tmp_path):
    output = tmp_path / "tls"
    asset = tmp_path / "assets/demo-ca.crt"
    metadata = tls.generate_certificates(["192.168.1.34"], output, asset)
    assert metadata["hosts"] == ["localhost", "127.0.0.1", "10.0.2.2", "192.168.1.34"]
    cert = x509.load_pem_x509_certificate((output / "server.crt").read_bytes())
    san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    assert san.get_values_for_type(x509.DNSName) == ["localhost"]
    assert ipaddress.ip_address("192.168.1.34") in san.get_values_for_type(x509.IPAddress)
    assert ExtendedKeyUsageOID.SERVER_AUTH in cert.extensions.get_extension_for_class(x509.ExtendedKeyUsage).value
    assert asset.read_bytes() == (output / "ca.crt").read_bytes()
    assert b"PRIVATE KEY" not in asset.read_bytes()
    assert b"PRIVATE KEY" in (output / "ca.key").read_bytes()
    assert b"PRIVATE KEY" in (output / "server.key").read_bytes()


def test_generator_does_not_overwrite_existing_runtime_or_asset(tmp_path):
    output = tmp_path / "existing-tls"
    output.mkdir()
    with pytest.raises(ValueError, match="already exists"):
        tls.generate_certificates(["192.168.1.34"], output)
    asset = tmp_path / "existing.crt"
    asset.write_text("preserve this file")
    fresh = tmp_path / "fresh"
    with pytest.raises(ValueError, match="already exists"):
        tls.generate_certificates(["192.168.1.34"], fresh, asset)
    assert not fresh.exists() and asset.read_text() == "preserve this file"


@pytest.mark.parametrize("host", ["8.8.8.8", "0.0.0.0", "*.local", "https://192.168.1.34:8443", "example.com"])
def test_generator_rejects_unsafe_or_ambiguous_hosts(tmp_path, host):
    with pytest.raises(ValueError):
        tls.generate_certificates([host], tmp_path / "no-output")
    assert not (tmp_path / "no-output").exists()


def test_generated_https_requires_ca_and_matching_hostname(tmp_path):
    output = tmp_path / "tls"
    tls.generate_certificates(["192.168.1.34"], output)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = b'{"status":"ok"}'
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(output / "server.crt", output / "server.key")
    server.socket = context.wrap_socket(server.socket, server_side=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    trusted = ssl.create_default_context(cafile=str(output / "ca.crt"))
    address = f"https://localhost:{server.server_port}/health"
    try:
        with urllib.request.urlopen(address, context=trusted, timeout=5) as response:
            assert response.read() == b'{"status":"ok"}'
        with pytest.raises(urllib.error.URLError):
            urllib.request.urlopen(address, context=ssl.create_default_context(), timeout=5)
        import socket
        with socket.create_connection(("127.0.0.1", server.server_port), timeout=5) as connection:
            with pytest.raises(ssl.SSLCertVerificationError):
                trusted.wrap_socket(connection, server_hostname="not-in-the-certificate.local")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
