from pydantic import BaseModel


class BaselineNeighbor(BaseModel):
    title: str
    days: float
    similarity: float


class BaselinePredictionResponse(BaseModel):
    enough_data: bool
    predicted_days: float | None = None
    confidence: float | None = None
    elapsed_days: float | None = None
    surprise: bool = False
    neighbors: list[BaselineNeighbor] = []
