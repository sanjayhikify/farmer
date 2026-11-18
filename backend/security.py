import base64
import binascii
import hashlib
import hmac
import os


_HASH_ALGORITHM = "pbkdf2_sha256"
_HASH_ITERATIONS = 600_000
_SALT_BYTES = 16
_DIGEST_BYTES = 32


def hash_pin(pin: str) -> str:
    salt = os.urandom(_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        pin.encode("utf-8"),
        salt,
        _HASH_ITERATIONS,
        dklen=_DIGEST_BYTES,
    )
    encode = lambda value: base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")
    return (
        f"{_HASH_ALGORITHM}${_HASH_ITERATIONS}$"
        f"{encode(salt)}${encode(digest)}"
    )


def is_hashed_pin(value: str | None) -> bool:
    return isinstance(value, str) and value.startswith(f"{_HASH_ALGORITHM}$")


def verify_pin(pin: str, stored_value: str | None) -> bool:
    if not isinstance(stored_value, str):
        return False

    if not is_hashed_pin(stored_value):
        return hmac.compare_digest(pin, stored_value)

    try:
        algorithm, iteration_text, salt_text, digest_text = stored_value.split("$")
        iterations = int(iteration_text)
        if (
            algorithm != _HASH_ALGORITHM
            or not 1 <= iterations <= _HASH_ITERATIONS
        ):
            return False

        def decode(value: str) -> bytes:
            padded = value + "=" * (-len(value) % 4)
            return base64.b64decode(padded, altchars=b"-_", validate=True)

        salt = decode(salt_text)
        expected_digest = decode(digest_text)
        if len(salt) != _SALT_BYTES or len(expected_digest) != _DIGEST_BYTES:
            return False

        actual_digest = hashlib.pbkdf2_hmac(
            "sha256",
            pin.encode("utf-8"),
            salt,
            iterations,
            dklen=_DIGEST_BYTES,
        )
    except (ValueError, TypeError, binascii.Error):
        return False

    return hmac.compare_digest(actual_digest, expected_digest)
