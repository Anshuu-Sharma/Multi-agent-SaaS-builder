from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://met:metdev@localhost:5432/met"
    redis_url: str = "redis://localhost:6379/0"
    gemini_api_key: str = ""
    default_llm_model: str = "gemini-2.5-flash"
    workspace_root: str = "./workspaces"
    cors_origins: list[str] = ["http://localhost:3000"]
    max_project_budget_cents: int = 5000
    max_per_call_cents: int = 50
    max_per_phase_cents: int = 1000
    api_key: str = ""  # Set MET_API_KEY to enforce authentication; empty = dev mode (no auth)

    model_config = {"env_file": ["../.env", ".env"], "env_prefix": "MET_", "extra": "ignore"}


settings = Settings()
