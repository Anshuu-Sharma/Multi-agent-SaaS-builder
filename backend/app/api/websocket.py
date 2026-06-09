"""WebSocket endpoint for real-time project updates."""

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.auth import require_ws_api_key
from app.core.events import Event
from app.core.redis import RedisClient
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])

# Maximum incoming message size in bytes (64 KB)
MAX_WS_MESSAGE_SIZE = 64 * 1024


class ConnectionManager:
    """Manages WebSocket connections per project."""

    def __init__(self):
        self.connections: dict[str, list[WebSocket]] = {}

    async def connect(self, project_id: str, websocket: WebSocket):
        await websocket.accept()
        self.connections.setdefault(project_id, []).append(websocket)
        logger.info(f"WebSocket connected for project {project_id}")

    def disconnect(self, project_id: str, websocket: WebSocket):
        if project_id in self.connections:
            self.connections[project_id] = [
                ws for ws in self.connections[project_id] if ws != websocket
            ]
            if not self.connections[project_id]:
                del self.connections[project_id]
        logger.info(f"WebSocket disconnected for project {project_id}")

    async def broadcast(self, project_id: str, data: dict):
        if project_id not in self.connections:
            return
        dead = []
        for ws in self.connections[project_id]:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.connections[project_id].remove(ws)


manager = ConnectionManager()


@router.websocket("/api/projects/{project_id}/ws")
async def project_websocket(websocket: WebSocket, project_id: uuid.UUID):
    """Real-time event stream for a project."""
    # Authenticate before accepting the connection
    await require_ws_api_key(websocket)

    pid = str(project_id)
    await manager.connect(pid, websocket)

    # Create a dedicated Redis subscriber for this connection
    import redis.asyncio as redis
    redis_conn = redis.from_url(settings.redis_url, decode_responses=True)
    pubsub = redis_conn.pubsub()
    await pubsub.subscribe(f"met:events:{project_id}")

    async def redis_listener():
        """Forward Redis events to WebSocket."""
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        event = Event.model_validate_json(message["data"])
                        await manager.broadcast(pid, {
                            "type": event.type.value,
                            "source": event.source,
                            "payload": event.payload,
                            "timestamp": event.timestamp.isoformat() if event.timestamp else None,
                        })
                    except Exception as e:
                        logger.error(f"Error broadcasting event: {e}")
        except asyncio.CancelledError:
            pass

    listener_task = asyncio.create_task(redis_listener())

    try:
        while True:
            # Keep connection alive, handle incoming messages from client
            data = await websocket.receive_text()
            # Reject oversized messages
            if len(data) > MAX_WS_MESSAGE_SIZE:
                await websocket.send_json({"error": "Message too large"})
                continue
            # Client can send ping/pong or commands
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        listener_task.cancel()
        manager.disconnect(pid, websocket)
        await pubsub.close()
        await redis_conn.close()
