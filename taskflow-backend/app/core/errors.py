from fastapi import HTTPException

STATUS_CODE_MAP: dict[int, str] = {
    400: "INVALID_PAYLOAD",
    401: "TOKEN_INVALID",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT_VERSION",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMIT_EXCEEDED",
    500: "INTERNAL_ERROR",
    502: "AI_SERVICE_UNAVAILABLE",
}


class AppError(HTTPException):
    """HTTPException that carries an explicit machine-readable error code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        detail: dict | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.message = message
        self.detail_data = detail or {}
