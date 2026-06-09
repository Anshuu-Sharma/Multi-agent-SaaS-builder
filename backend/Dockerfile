FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r met && useradd -r -g met -d /app -s /sbin/nologin met

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY . .

# Ensure workspace directory exists and is writable
RUN mkdir -p /workspaces && chown -R met:met /workspaces /app

USER met

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
