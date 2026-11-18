import unittest

from security import hash_pin, is_hashed_pin, verify_pin


class PinSecurityTests(unittest.TestCase):
    def test_hashes_are_salted_and_verify_correct_pin(self):
        first_hash = hash_pin("1234")
        second_hash = hash_pin("1234")

        self.assertNotEqual(first_hash, second_hash)
        self.assertTrue(is_hashed_pin(first_hash))
        self.assertTrue(verify_pin("1234", first_hash))
        self.assertFalse(verify_pin("0000", first_hash))

    def test_legacy_plaintext_pin_can_be_verified_for_upgrade(self):
        self.assertFalse(is_hashed_pin("1234"))
        self.assertTrue(verify_pin("1234", "1234"))
        self.assertFalse(verify_pin("0000", "1234"))

    def test_malformed_hash_is_rejected(self):
        self.assertFalse(verify_pin("1234", "pbkdf2_sha256$invalid"))
        self.assertFalse(verify_pin("1234", None))


if __name__ == "__main__":
    unittest.main()
