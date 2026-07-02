from app.schemas.common import StrictBaseModel


class PrintNoticeUpsertRequest(StrictBaseModel):
    customer: str
    customer_label: str
    workorder_label: str
    workorder_value: str


class PrintNoticeDeleteRequest(StrictBaseModel):
    customer: str
    workorder_value: str


class PrintNoticeEntry(StrictBaseModel):
    customer: str
    customer_label: str
    workorder_label: str
    workorder_value: str
    created_at: str
