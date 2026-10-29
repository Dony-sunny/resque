"""Environment configuration; unsafe demo identity selection is opt-in."""
from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./resq-relay.db"
    demo_mode: bool = False
    cors_origins: tuple[str, ...] = ()
    demo_access_key: str = ""
    sms_secret: str = ""

    @classmethod
    def from_env(cls):
        return cls(
            database_url=os.getenv("DATABASE_URL", "sqlite:///./resq-relay.db"),
            demo_mode=os.getenv("RESQ_DEMO_MODE", "false").lower() == "true",
            cors_origins=tuple(filter(None, os.getenv("RESQ_CORS_ORIGINS", "").split(","))),
            demo_access_key=os.getenv("RESQ_DEMO_ACCESS_KEY", ""),
            # Shared secret the SMS gateway (Twilio, MSG91, Exotel...) appends as ?key=...
            sms_secret=os.getenv("RESQ_SMS_SECRET", ""),
        )
