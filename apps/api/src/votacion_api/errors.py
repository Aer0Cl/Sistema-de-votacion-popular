class ApiError(Exception):
    """Error de negocio con su codigo HTTP; el mensaje se muestra al usuario."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
