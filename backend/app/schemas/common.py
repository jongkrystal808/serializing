from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field


class StrictBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ErrorDetail(StrictBaseModel):
    code: str = Field(default="BAD_REQUEST")
    message: str
    details: Optional[Dict[str, Any]] = None


class ApiResponse(StrictBaseModel):
    success: bool = True
    message: str = "ok"
    data: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[ErrorDetail] = None
