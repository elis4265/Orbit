"""Local, dependency-free effort predictor for the Baseline method.

Pure-Python TF-IDF + cosine k-NN over a project's own closed tasks: given a task's
text, find the most similar finished tasks and predict effort (their lead-time).
No external API, no model server, no new deps — deterministic and local.
"""
import math
import re
from collections import Counter

_TOKEN = re.compile(r"[a-z0-9]+")


def tokenize(text: str | None) -> list[str]:
    return _TOKEN.findall((text or "").lower())


def is_surprise(elapsed_days: float | None, predicted_days: float, factor: float = 1.5) -> bool:
    """An in-progress task is a 'surprise' when it's running well past its prediction."""
    if elapsed_days is None or predicted_days <= 0:
        return False
    return elapsed_days > predicted_days * factor


class BaselineModel:
    def __init__(self, samples: list[tuple[str, float]]):
        """samples: [(text, effort)] from closed tasks (effort = e.g. lead-days)."""
        self.samples = samples
        self.efforts = [e for _, e in samples]
        docs = [tokenize(t) for t, _ in samples]
        n = len(docs)
        df: Counter = Counter()
        for d in docs:
            for term in set(d):
                df[term] += 1
        # smoothed idf
        self.idf = {t: math.log((n + 1) / (c + 1)) + 1 for t, c in df.items()}
        self.doc_vecs = [self._vec(d) for d in docs]

    def _vec(self, tokens: list[str]) -> dict[str, float]:
        tf = Counter(tokens)
        v = {t: cnt * self.idf.get(t, 0.0) for t, cnt in tf.items() if t in self.idf}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        return {t: x / norm for t, x in v.items()}

    def predict(self, text: str, k: int = 3) -> dict | None:
        """Returns {"predicted", "neighbors", "confidence"} or None if untrained."""
        if not self.samples:
            return None
        qv = self._vec(tokenize(text))
        sims = []
        for i, dv in enumerate(self.doc_vecs):
            # both normalized → cosine == dot product
            s = sum(qv.get(t, 0.0) * x for t, x in dv.items())
            sims.append((s, i))
        sims.sort(key=lambda p: p[0], reverse=True)
        top = sims[: max(1, k)]
        neighbour_efforts = sorted(self.efforts[i] for _, i in top)
        predicted = neighbour_efforts[len(neighbour_efforts) // 2]  # median
        return {
            "predicted": predicted,
            "neighbors": [
                {"text": self.samples[i][0], "effort": self.efforts[i], "similarity": round(s, 3)}
                for s, i in top
            ],
            "confidence": round(top[0][0], 3),  # best-neighbour similarity
        }
