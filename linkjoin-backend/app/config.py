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
    # TEMPORARILY BACK AT 7 DAYS. This was cut to 60 minutes, paired with the
    # refresh token below, to bound what an injection that reads localStorage can
    # do with a stolen access token. That broke every INSTALLED browser extension:
    # the published build (v0.3.3) copies only `token` from the page and returns
    # null on a 401, with no refresh path, so it died 60 minutes after the user
    # last opened the web app. The refresh support exists in linkjoin-extension/
    # but ships to users only via a Chrome Web Store update.
    #
    # Restore to 60 once the new extension build has reached most installs. The
    # refresh flow is already live and the web app already uses it, so lowering
    # this is a one-line change plus an Azure restart.
    #
    # Override without a deploy by setting ACCESS_TOKEN_EXPIRE_MINUTES in the
    # Azure app settings.
    access_token_expire_minutes: int = 10080
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
