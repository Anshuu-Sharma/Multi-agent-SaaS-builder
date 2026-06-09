from abc import ABC, abstractmethod

from pydantic import BaseModel


class LLMConfig(BaseModel):
    model: str = "gemini-2.0-flash"
    temperature: float = 0.3
    max_output_tokens: int = 8192
    response_format: str = "json"  # "json" or "text"


class LLMResponse(BaseModel):
    content: str
    input_tokens: int
    output_tokens: int
    model: str
    cost_cents: int


class BaseLLMProvider(ABC):
    @abstractmethod
    async def generate(
        self,
        system_prompt: str,
        messages: list[dict],
        config: LLMConfig,
    ) -> LLMResponse:
        """Generate a response from the LLM.

        Args:
            system_prompt: Role-specific system prompt
            messages: Conversation history [{"role": "user"|"model", "content": "..."}]
            config: LLM configuration (model, temperature, etc.)

        Returns:
            LLMResponse with content, token counts, and cost
        """
        ...
