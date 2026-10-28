import os
import sys
from pathlib import Path

# Importable as `app` from the ai-service root, and configured before any
# module reads settings. No database or model is touched by these tests.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("AI_SERVICE_TOKEN", "test-internal-token-0123456789")
os.environ.setdefault("AI_DATABASE_URL", "postgresql://unused:unused@localhost:1/unused")
os.environ.pop("NVIDIA_API_KEY", None)
