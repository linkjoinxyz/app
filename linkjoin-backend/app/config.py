from pathlib import Path
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

# The database holding real users. Anything running against it is production.
PRODUCTION_DATABASE = "zoom_opener"

# Presence of this file is what "running locally" means. The image is built from
# a git checkout and .env is gitignored, so a deployed container never has one —
# which is why the guards below cannot fire in production.
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def running_locally() -> bool:
    return _ENV_FILE.exists()


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

    # Escape hatches, both off by default. Set them in .env only for as long as
    # you actually need them.
    allow_production_database: bool = False
    run_scheduler_locally: bool = False

    @model_validator(mode="after")
    def _keep_local_runs_off_production(self):
        """Refuse to boot a local process against the production database.

        mongo_database defaults to the production name, so `uvicorn app.main:app`
        with no override silently attached to real users — with real Twilio and
        Gmail credentials from .env. A stray dev server left running for two weeks
        ran the scheduler against production and every reminder text went out
        twice, because its leader lock lived in a local Redis that the deployed
        app cannot see.
        """
        if running_locally() and self.mongo_database == PRODUCTION_DATABASE \
                and not self.allow_production_database:
            raise ValueError(
                f"Refusing to start: MONGO_DATABASE is the production database "
                f"({PRODUCTION_DATABASE!r}) and a .env file is present, so this is a "
                f"local process. Set MONGO_DATABASE (e.g. linkjoin_localdev) in .env, "
                f"or ALLOW_PRODUCTION_DATABASE=true if you really mean it."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
