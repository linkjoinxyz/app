from cryptography.fernet import Fernet
from app.config import get_settings

_settings = get_settings()
_fernet = Fernet(_settings.encrypt_key.encode())


def encrypt(plaintext: str) -> bytes:
    return _fernet.encrypt(plaintext.encode())


def decrypt(ciphertext: bytes | str) -> str:
    if isinstance(ciphertext, str):
        ciphertext = ciphertext.encode()
    return _fernet.decrypt(ciphertext).decode()
