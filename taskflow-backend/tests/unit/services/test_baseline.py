"""Unit tests for the local TF-IDF + kNN effort predictor."""
from app.services.baseline import BaselineModel, tokenize, is_surprise

SAMPLES = [
    ("login auth bug fix", 2.0),
    ("login page styling tweak", 1.0),
    ("database migration huge refactor", 10.0),
    ("schema migration change", 8.0),
]


def test_tokenize():
    assert tokenize("Login-Page, FIX!") == ["login", "page", "fix"]
    assert tokenize(None) == []


def test_predicts_from_similar_login_tasks():
    m = BaselineModel(SAMPLES)
    r = m.predict("login authentication bug", k=2)
    assert r is not None
    # nearest neighbours should be the two login tasks → low effort
    assert r["predicted"] <= 2.0
    texts = [n["text"] for n in r["neighbors"]]
    assert all("login" in t for t in texts)


def test_predicts_from_similar_migration_tasks():
    m = BaselineModel(SAMPLES)
    r = m.predict("schema migration refactor", k=2)
    assert r["predicted"] >= 8.0
    assert all("migration" in n["text"] for n in r["neighbors"])


def test_confidence_is_top_similarity():
    m = BaselineModel(SAMPLES)
    r = m.predict("login auth bug fix", k=1)   # exact match
    assert r["confidence"] > 0.9               # near-identical text


def test_empty_model_returns_none():
    assert BaselineModel([]).predict("anything") is None


def test_deterministic():
    a = BaselineModel(SAMPLES).predict("migration schema", k=3)
    b = BaselineModel(SAMPLES).predict("migration schema", k=3)
    assert a == b


def test_is_surprise():
    assert is_surprise(elapsed_days=5.0, predicted_days=2.0) is True     # 5 > 2*1.5
    assert is_surprise(elapsed_days=2.5, predicted_days=2.0) is False    # 2.5 < 3.0
    assert is_surprise(elapsed_days=None, predicted_days=2.0) is False   # not started
    assert is_surprise(elapsed_days=10.0, predicted_days=0.0) is False   # no prediction
    assert is_surprise(elapsed_days=4.0, predicted_days=2.0, factor=3.0) is False
