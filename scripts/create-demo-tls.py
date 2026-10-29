"""Generate a short-lived private LAN demo CA/server certificate without TLS bypass.

Install backend/requirements-tls.txt first. Only the CA CERTIFICATE can be exported
to Android assets. Private keys stay under backend/data/tls (ignored runtime files).
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import ipaddress
import json
import os
from pathlib import Path
import re

try:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
except ImportError as error:
    raise SystemExit("Install the optional TLS generator dependency: python -m pip install -r backend/requirements-tls.txt") from error


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_HOSTS = ("localhost", "127.0.0.1", "10.0.2.2")


def normalize_hosts(hosts: list[str]) -> list[str]:
    checked: list[str] = []
    for value in [*DEFAULT_HOSTS, *hosts]:
        host = value.strip().lower()
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            if host != "localhost" and not (host.endswith(".local") and re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", host)):
                raise ValueError("Use an explicit private LAN IP, localhost or a .local hostname; do not include a URL, port or wildcard.")
        else:
            if address.is_unspecified or address.is_multicast or not (address.is_private or address.is_loopback):
                raise ValueError("Demo TLS hosts must be private LAN or loopback addresses.")
            host = str(address)
        if host not in checked:
            checked.append(host)
    return checked


def _write_new(path: Path, data: bytes, private: bool = False) -> None:
    with path.open("xb") as handle:
        handle.write(data)
    if private:
        os.chmod(path, 0o600)


def generate_certificates(hosts: list[str], output: Path, export_ca: Path | None = None) -> dict:
    hosts = normalize_hosts(hosts)
    output = output.resolve()
    if output.exists():
        raise ValueError("TLS output directory already exists. Reuse its certificates, or choose a new directory and rebuild the demo APK.")
    if export_ca is not None:
        export_ca = export_ca.resolve()
        if export_ca.exists():
            raise ValueError("Public CA asset already exists; choose a new path. Nothing was overwritten.")
        if export_ca.suffix.lower() not in {".crt", ".cer"}:
            raise ValueError("Export only a public CA certificate with a .crt or .cer filename.")
    now = datetime.now(timezone.utc)
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    server_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "ResQ Relay private LAN demo CA")])
    ca = (
        x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
        .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=30))
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=True, key_encipherment=False, content_commitment=False,
                                     data_encipherment=False, key_agreement=False, key_cert_sign=True,
                                     crl_sign=True, encipher_only=None, decipher_only=None), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
        .sign(ca_key, hashes.SHA256())
    )
    names = []
    for host in hosts:
        try:
            names.append(x509.IPAddress(ipaddress.ip_address(host)))
        except ValueError:
            names.append(x509.DNSName(host))
    server = (
        x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "ResQ Relay LAN API")]))
        .issuer_name(ca.subject).public_key(server_key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=7))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.SubjectAlternativeName(names), critical=False)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .add_extension(x509.KeyUsage(digital_signature=True, key_encipherment=True, content_commitment=False,
                                     data_encipherment=False, key_agreement=False, key_cert_sign=False,
                                     crl_sign=False, encipher_only=None, decipher_only=None), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(server_key.public_key()), critical=False)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
        .sign(ca_key, hashes.SHA256())
    )
    ca_pem = ca.public_bytes(serialization.Encoding.PEM)
    output.mkdir(parents=True, exist_ok=False)
    _write_new(output / "ca.key", ca_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()), private=True)
    _write_new(output / "ca.crt", ca_pem)
    _write_new(output / "server.key", server_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()), private=True)
    _write_new(output / "server.crt", server.public_bytes(serialization.Encoding.PEM))
    metadata = {"hosts": hosts, "server_valid_until": server.not_valid_after_utc.isoformat(),
                "ca_sha256": ca.fingerprint(hashes.SHA256()).hex(), "purpose": "Private LAN hackathon demo only"}
    _write_new(output / "metadata.json", (json.dumps(metadata, indent=2) + "\n").encode())
    if export_ca is not None:
        export_ca.parent.mkdir(parents=True, exist_ok=True)
        _write_new(export_ca, ca_pem)
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", action="append", required=True, help="Current private LAN IP; repeat for another explicit host")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "backend/data/tls")
    parser.add_argument("--export-ca", type=Path, help="Optional public CA .crt asset path for a host-scoped demo APK build")
    args = parser.parse_args()
    try:
        metadata = generate_certificates(args.host, args.output, args.export_ca)
    except ValueError as error:
        parser.error(str(error))
    print("TLS files created:", args.output.resolve())
    print("Exact certificate hosts:", ", ".join(metadata["hosts"]))
    print("Server certificate valid until:", metadata["server_valid_until"])
    print("CA SHA-256:", metadata["ca_sha256"])
    if args.export_ca:
        print("Public CA certificate only:", args.export_ca.resolve())
    print("Keep ca.key/server.key private. Do not put backend/data in source archives.")


if __name__ == "__main__":
    main()
