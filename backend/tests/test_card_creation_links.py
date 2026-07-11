from cryptography.fernet import Fernet

from app.services.card_creation_links import CreationLinkTokenCipher


def test_creation_link_token_cipher_keeps_raw_token_out_of_stored_value() -> None:
    raw_token = "public-token-that-must-not-be-stored-plain"
    cipher = CreationLinkTokenCipher(Fernet.generate_key().decode("ascii"))

    ciphertext = cipher.encrypt(raw_token)

    assert ciphertext != raw_token
    assert raw_token not in ciphertext
    assert cipher.decrypt(ciphertext) == raw_token
