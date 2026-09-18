from enum import Enum


class Customer(str, Enum):
    YINGBANG = "yingbang"
    LUNFEI = "lunfei"
    BNG = "bng"
    CHG = "chg"
    HMG = "hmg"
    CLG = "clg"
    DEG = "deg"
    FZG = "fzg"


EXTERNAL_SERIAL_CUSTOMERS = frozenset(
    {Customer.BNG, Customer.CHG, Customer.HMG, Customer.CLG}
)
