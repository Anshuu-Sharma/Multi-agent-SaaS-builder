import asyncio
import json
import logging
from typing import AsyncGenerator

import redis.asyncio as redis

from app.config import settings
from app.core.events import Event

logger = logging.getLogger(__name__)

MAX_RECONNECT_DELAY = 30  # seconds
INITIAL_RECONNECT_DELAY = 1  # seconds


class RedisClient:
    def __init__(self):
        self._redis: redis.Redis | None = None
        self._pubsub: redis.client.PubSub | None = None

    async def connect(self):
        self._redis = redis.from_url(settings.redis_url, decode_responses=True)
        self._pubsub = self._redis.pubsub()
        logger.info("Redis connected")

    async def disconnect(self):
        if self._pubsub:
            await self._pubsub.close()
        if self._redis:
            await self._redis.close()
        logger.info("Redis disconnected")

    async def _ensure_connected(self):
        """Check connection health and reconnect if needed."""
        if self._redis is None:
            await self.connect()
            return
        try:
            await self._redis.ping()
        except (redis.ConnectionError, redis.TimeoutError, OSError) as e:
            logger.warning(f"Redis connection lost: {e}. Reconnecting...")
            await self._reconnect()

    async def _reconnect(self):
        """Reconnect with exponential backoff."""
        delay = INITIAL_RECONNECT_DELAY
        while True:
            try:
                if self._pubsub:
                    try:
                        await self._pubsub.close()
                    except Exception:
                        pass
                if self._redis:
                    try:
                        await self._redis.close()
                    except Exception:
                        pass

                self._redis = redis.from_url(settings.redis_url, decode_responses=True)
                self._pubsub = self._redis.pubsub()
                await self._redis.ping()
                logger.info("Redis reconnected successfully")
                return
            except (redis.ConnectionError, redis.TimeoutError, OSError) as e:
                logger.warning(f"Redis reconnect failed: {e}. Retrying in {delay}s...")
                await asyncio.sleep(delay)
                delay = min(delay * 2, MAX_RECONNECT_DELAY)

    async def publish_event(self, event: Event):
        await self._ensure_connected()
        channel = f"met:events:{event.project_id}"
        await self._redis.publish(channel, event.model_dump_json())
        # Also publish to global channel for dashboard
        await self._redis.publish("met:events:global", event.model_dump_json())

    async def subscribe_project(self, project_id: str) -> None:
        await self._ensure_connected()
        await self._pubsub.subscribe(f"met:events:{project_id}")

    async def subscribe_global(self) -> None:
        await self._ensure_connected()
        await self._pubsub.subscribe("met:events:global")

    async def listen(self) -> AsyncGenerator[Event, None]:
        delay = INITIAL_RECONNECT_DELAY
        while True:
            try:
                async for message in self._pubsub.listen():
                    delay = INITIAL_RECONNECT_DELAY  # Reset on success
                    if message["type"] == "message":
                        try:
                            event = Event.model_validate_json(message["data"])
                            yield event
                        except Exception as e:
                            logger.error(f"Failed to parse event: {e}")
            except (redis.ConnectionError, redis.TimeoutError, OSError) as e:
                logger.warning(f"Redis listen connection lost: {e}. Reconnecting in {delay}s...")
                await asyncio.sleep(delay)
                delay = min(delay * 2, MAX_RECONNECT_DELAY)
                await self._reconnect()
                # Re-subscribe after reconnect
                await self._pubsub.subscribe("met:events:global")
                logger.info("Re-subscribed to global events after reconnect")

    # Simple key-value cache operations
    async def set(self, key: str, value: str, ttl: int = 3600):
        await self._ensure_connected()
        await self._redis.set(key, value, ex=ttl)

    async def get(self, key: str) -> str | None:
        await self._ensure_connected()
        return await self._redis.get(key)

    async def delete(self, key: str):
        await self._ensure_connected()
        await self._redis.delete(key)


redis_client = RedisClient()
