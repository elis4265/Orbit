"""Fernet symmetric encryption for stored provider tokens.

ENCRYPTION_KEY must be a urlsafe-base64 32-byte key (`Fernet.generate_key()`).
Unset → encryption is unavailable and token-storing flows degrade with a clear
503 rather than silently storing plaintext.
"""
from cryptography.fernet import Fernet

from app.core.config import settings
from app.core.errors import AppError


def is_configured() -> bool:
    return bool(settings.encryption_key)


def _fernet() -> Fernet:
    if not settings.encryption_key:
        raise AppError(503, code="ENCRYPTION_NOT_CONFIGURED",
                       message="Set ENCRYPTION_KEY to connect Git providers that store a token.")
    return Fernet(settings.encryption_key.encode())


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()
