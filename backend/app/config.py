from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://user:password@db:5432/lectures"

    model_config = {
        "env_file": ".env",
        "extra": "ignore",
    }


settings = Settings()
