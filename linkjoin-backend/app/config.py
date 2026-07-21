from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    mongo_uri: str
    jwt_secret: str
    encrypt_key: str
    gmail_pwd: str
    twilio_sid: str = ""
    twilio_token: str = ""
    vonage_api_key: str = ""
    vonage_api_secret: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    google_chrome_client_id: str = ""
    clever_client_id: str = ""
    clever_client_secret: str = ""
    add_accounts_token: str = ""
    text_key: str = ""
    environment: str = "local"
    frontend_url: str = "http://localhost:5173"

    # JWT settings
    # Kill switch for the password-reset token epoch. Rollback is otherwise a code
    # deploy plus a manual Azure restart; this makes it an app-setting change.
    enforce_password_epoch: bool = True
    jwt_algorithm: str = "HS256"
    # Was 10080 (7 days). The access token lives in localStorage, so an injection
    # that reads it previously yielded a week of access; a short window plus a
    # refresh token bounds that without forcing daily re-login. The refresh token
    # carries purpose="refresh", which get_current_user already refuses to accept
    # as a credential via _NON_ACCESS_CLAIMS.
    access_token_expire_minutes: int = 60
    refresh_token_expire_minutes: int = 10080  # 7 days
    reset_token_expire_minutes: int = 60
    confirm_token_expire_minutes: int = 60

    # App settings
    twilio_from_number: str = "+18552861505"
    gmail_from: str = "noreply@linkjoin.xyz"
    app_base_url: str = "https://linkjoin.xyz"
    scheduler_email_filter: str = ""
    redis_url: str = "redis://localhost:6379"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5-20251001"
    mongo_database: str = "zoom_opener"
    contact_email: str = "seth@linkjoin.xyz"
    sentry_dsn: str = ""
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
