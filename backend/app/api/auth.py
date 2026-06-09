"""API key authentication dependency for all endpoints."""

from fastapi import Depends, HTTPException, WebSocket, status
from fastapi.security import APIKeyHeader

from app.config import settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_api_key(api_key: str | None = Depends(api_key_header)) -> str:
    """Validate API key from X-API-Key header. Returns the key on success."""
    if not settings.api_key:
        # If no API key is configured, allow all requests (dev mode)
        return "dev"
    if not api_key or api_key != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )
    return api_key


async def require_ws_api_key(websocket: WebSocket) -> str:
    """Validate API key for WebSocket connections from query param or header."""
    if not settings.api_key:
        return "dev"
    # Check query param first (WebSocket clients often can't set headers)
    api_key = websocket.query_params.get("api_key")
    if not api_key:
        # Fall back to header
        api_key = websocket.headers.get("x-api-key")
    if not api_key or api_key != settings.api_key:
        await websocket.close(code=4001, reason="Invalid or missing API key")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )
    return api_key
