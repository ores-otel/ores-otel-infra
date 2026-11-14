"""CORS origin normalization security regressions (no cluster required)."""

import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts" / "validate-internal-diagnostics.py"
spec = importlib.util.spec_from_file_location("internal_diagnostics_validator", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CorsOriginTests(unittest.TestCase):
    def test_accepts_bare_https_origins(self):
        for origin in ["https://app.example.com", "https://app.example.com:443"]:
            module.validate_origin(origin, "fixture")

    def test_rejects_credentials_queries_fragments_and_paths(self):
        for origin in [
            "https://user:password@app.example.com",
            "https://app.example.com?access_token=secret",
            "https://app.example.com#opaque-secret",
            "https://app.example.com/admin",
            "https://app.example.com/",
            "https://app.example.com:99999",
            "https://app.example.com\\\\@other.example",
            "https://*.example.com",
            "http://app.example.com",
            "https://app.example.com\n",
        ]:
            with self.subTest(origin=origin), self.assertRaises(AssertionError):
                module.validate_origin(origin, "fixture")


if __name__ == "__main__":
    unittest.main()
