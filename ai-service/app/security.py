"""Internal-only access: every route except /health requires the shared token."""

from __future__ import annotations

import hmac

from fastapi import Depends, Header, HTTPException

from .config import Settings, get_settings


def require_internal_token(
    x_internal_token: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    # Constant-time comparison: the token is the only thing standing between
    # this service and users' private notes.
    if not x_internal_token or not hmac.compare_digest(x_internal_token, settings.internal_token):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Internal endpoint"})
