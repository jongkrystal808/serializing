from typing import Any, Dict, Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field


class StrictBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ErrorDetail(StrictBaseModel):
    code: str = Field(default="BAD_REQUEST")
    message: str
    details: Optional[Dict[str, Any]] = None


DataT = TypeVar("DataT")


class ApiResponse(StrictBaseModel, Generic[DataT]):
    success: bool = True
    message: str = "ok"
    data: DataT
    error: Optional[ErrorDetail] = None


class HealthData(StrictBaseModel):
    status: str
