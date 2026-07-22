"""Unit tests for per-provider webhook signature verification (pure)."""
import hashlib
import hmac

from app.services.vcs.signatures import verify_github, verify_gitlab, verify_bitbucket

SECRET = "s3cr3t"
BODY = b'{"hello":"world"}'


def _gh_sig(secret, body):
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def test_github_valid_signature():
    assert verify_github(SECRET, BODY, _gh_sig(SECRET, BODY)) is True


def test_github_wrong_secret_fails():
    assert verify_github(SECRET, BODY, _gh_sig("other", BODY)) is False


def test_github_tampered_body_fails():
    assert verify_github(SECRET, b'{"hello":"evil"}', _gh_sig(SECRET, BODY)) is False


def test_github_missing_or_malformed_header_fails():
    assert verify_github(SECRET, BODY, None) is False
    assert verify_github(SECRET, BODY, "md5=abc") is False
    assert verify_github("", BODY, _gh_sig(SECRET, BODY)) is False


def test_gitlab_token_match():
    assert verify_gitlab(SECRET, SECRET) is True
    assert verify_gitlab(SECRET, "nope") is False
    assert verify_gitlab(SECRET, None) is False
    assert verify_gitlab("", "") is False


def test_bitbucket_hmac_with_and_without_prefix():
    raw = hmac.new(SECRET.encode(), BODY, hashlib.sha256).hexdigest()
    assert verify_bitbucket(SECRET, BODY, raw) is True
    assert verify_bitbucket(SECRET, BODY, "sha256=" + raw) is True
    assert verify_bitbucket(SECRET, BODY, "deadbeef") is False
    assert verify_bitbucket(SECRET, BODY, None) is False
