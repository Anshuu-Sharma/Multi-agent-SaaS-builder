import logging

from google import genai
from google.genai import types

from app.config import settings
from app.llm.base import BaseLLMProvider, LLMConfig, LLMResponse

logger = logging.getLogger(__name__)

# Gemini pricing per 1M tokens (in cents)
GEMINI_PRICING: dict[str, dict[str, float]] = {
    "gemini-2.0-flash": {"input": 10, "output": 40},
    "gemini-2.5-flash": {"input": 15, "output": 60},
    "gemini-2.5-flash-preview-05-20": {"input": 15, "output": 60},
    "gemini-2.5-pro-preview-05-06": {"input": 125, "output": 500},
    "gemini-1.5-flash": {"input": 7.5, "output": 30},
    "gemini-1.5-pro": {"input": 125, "output": 500},
}


def _calculate_cost(model: str, input_tokens: int, output_tokens: int) -> int:
    pricing = GEMINI_PRICING.get(model, GEMINI_PRICING["gemini-2.0-flash"])
    cost = (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000
    return max(1, int(cost))  # Minimum 1 cent per call for tracking


class GeminiProvider(BaseLLMProvider):
    def __init__(self, api_key: str | None = None):
        self.client = genai.Client(api_key=api_key or settings.gemini_api_key)

    async def generate(
        self,
        system_prompt: str,
        messages: list[dict],
        config: LLMConfig,
    ) -> LLMResponse:
        contents = []
        for msg in messages:
            role = msg["role"]
            if role == "assistant":
                role = "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part(text=msg["content"])],
                )
            )

        gen_config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=config.temperature,
            max_output_tokens=config.max_output_tokens,
            response_mime_type=(
                "application/json" if config.response_format == "json" else "text/plain"
            ),
        )

        try:
            # Use async client to avoid blocking the event loop
            response = await self.client.aio.models.generate_content(
                model=config.model,
                contents=contents,
                config=gen_config,
            )

            input_tokens = response.usage_metadata.prompt_token_count or 0
            output_tokens = response.usage_metadata.candidates_token_count or 0
            cost_cents = _calculate_cost(config.model, input_tokens, output_tokens)

            text = response.text or ""
            logger.info(
                f"Gemini call: model={config.model} "
                f"in={input_tokens} out={output_tokens} cost={cost_cents}c"
            )

            return LLMResponse(
                content=text,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model=config.model,
                cost_cents=cost_cents,
            )
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise
