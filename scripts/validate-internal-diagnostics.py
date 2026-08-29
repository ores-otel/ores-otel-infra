#!/usr/bin/env python3
"""Fail closed when internal-diagnostics reference infrastructure drifts."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_ID = "ores.otel.log/internal-diagnostic/v1"
FORBIDDEN_RENDERED_TERMS = (
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "private_key",
    "AZURE_CLIENT_SECRET",
    "clientSecret",
    "kind: Secret",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def render(path: str) -> str:
    environment = os.environ.copy()
    environment["KUBECTL_NO_CONFIRM"] = "1"
    completed = subprocess.run(
        ["kubectl", "kustomize", path],
        cwd=ROOT,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout


def validate_render(path: str, provider: str, identity_marker: str | None) -> None:
    manifest = render(path)
    require(SCHEMA_ID in manifest, f"{path}: missing closed schema ID")
    require(
        "ORES_INTERNAL_DIAGNOSTICS_ENABLED: \"true\"" in manifest,
        f"{path}: internal diagnostics are not enabled",
    )
    require(
        "ORES_INTERNAL_DIAGNOSTICS_STDERR_FALLBACK: \"true\"" in manifest,
        f"{path}: stderr fallback is not enabled",
    )
    require(
        f"ORES_INTERNAL_DIAGNOSTICS_PROVIDER: {provider}" in manifest,
        f"{path}: expected provider {provider}",
    )
    require(
        "serviceAccountName: ores-otel-internal-diagnostics" in manifest,
        f"{path}: workload service account is not selected",
    )
    require(
        "automountServiceAccountToken: false" in manifest,
        f"{path}: Kubernetes API token must not be mounted",
    )
    if identity_marker is not None:
        require(identity_marker in manifest, f"{path}: workload identity binding missing")
    for forbidden in FORBIDDEN_RENDERED_TERMS:
        require(forbidden not in manifest, f"{path}: forbidden static credential field {forbidden}")


def load_json(path: str) -> object:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def validate_origin(origin: object, path: str) -> None:
    require(isinstance(origin, str), f"{path}: origin must be a string")
    require(origin.startswith("https://"), f"{path}: origin must use HTTPS")
    require("*" not in origin, f"{path}: wildcard origin is forbidden")
    require(origin.count("/") == 2, f"{path}: origin must not contain a path")


def validate_aws_cors() -> None:
    path = "outage-spool/aws-s3-cors.json"
    value = load_json(path)
    require(isinstance(value, list) and len(value) == 1, f"{path}: require one rule")
    rule = value[0]
    require(isinstance(rule, dict), f"{path}: rule must be an object")
    origins = rule.get("AllowedOrigins")
    require(isinstance(origins, list) and len(origins) == 1, f"{path}: require one origin")
    validate_origin(origins[0], path)
    require(rule.get("AllowedMethods") == ["PUT"], f"{path}: only PUT is allowed")
    require(rule.get("AllowedHeaders") == ["content-type"], f"{path}: unexpected headers")
    require(rule.get("ExposeHeaders") == ["ETag"], f"{path}: expose only ETag")
    require(rule.get("MaxAgeSeconds") == 300, f"{path}: preflight cache must be 300s")


def validate_gcp_cors() -> None:
    path = "outage-spool/gcp-storage-cors.json"
    value = load_json(path)
    require(isinstance(value, list) and len(value) == 1, f"{path}: require one rule")
    rule = value[0]
    require(isinstance(rule, dict), f"{path}: rule must be an object")
    origins = rule.get("origin")
    require(isinstance(origins, list) and len(origins) == 1, f"{path}: require one origin")
    validate_origin(origins[0], path)
    require(rule.get("method") == ["PUT"], f"{path}: only PUT is allowed")
    require(
        set(rule.get("responseHeader", [])) == {"Content-Type", "ETag"},
        f"{path}: unexpected response headers",
    )
    require(rule.get("maxAgeSeconds") == 300, f"{path}: preflight cache must be 300s")


def validate_azure_cors() -> None:
    path = "outage-spool/azure-blob-service-cors.json"
    value = load_json(path)
    require(isinstance(value, dict), f"{path}: root must be an object")
    cors = value.get("cors")
    require(isinstance(cors, dict), f"{path}: missing CORS properties")
    rules = cors.get("corsRules")
    require(isinstance(rules, list) and len(rules) == 1, f"{path}: require one rule")
    rule = rules[0]
    require(isinstance(rule, dict), f"{path}: rule must be an object")
    origins = rule.get("allowedOrigins")
    require(isinstance(origins, list) and len(origins) == 1, f"{path}: require one origin")
    validate_origin(origins[0], path)
    require(rule.get("allowedMethods") == ["PUT"], f"{path}: only PUT is allowed")
    require(
        set(rule.get("allowedHeaders", [])) == {"content-type", "x-ms-blob-type"},
        f"{path}: unexpected request headers",
    )
    require(rule.get("exposedHeaders") == ["ETag"], f"{path}: expose only ETag")
    require(rule.get("maxAgeInSeconds") == 300, f"{path}: preflight cache must be 300s")


def validate_worker_boundary() -> None:
    worker = (ROOT / "cloudflare/worker.js").read_text(encoding="utf-8").lower()
    for forbidden in ("presign", "signedurl", "sharedaccesssignature", "generateusersas"):
        require(forbidden not in worker, f"Cloudflare worker must not issue grants: {forbidden}")


def main() -> None:
    validate_render("k8s", "stderr", None)
    validate_render("overlays/aws", "aws_cloudwatch_logs", "eks.amazonaws.com/role-arn")
    validate_render("overlays/gcp", "google_cloud_logging", "iam.gke.io/gcp-service-account")
    validate_render("overlays/azure", "azure_monitor", "azure.workload.identity/client-id")
    validate_aws_cors()
    validate_gcp_cors()
    validate_azure_cors()
    validate_worker_boundary()
    print("internal diagnostics infrastructure validation passed")


if __name__ == "__main__":
    main()
