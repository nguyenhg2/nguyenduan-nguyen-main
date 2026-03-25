from datetime import datetime
from typing import Optional                         
from pydantic import BaseModel, Field

from app.models.common import ModeFeas, Requirements, IncidentStatus, DispatchInfo


class IncidentBase(BaseModel):
    companyId: str
    unitId: str
    componentId: str
    typeCode: str
    priority: int
    status: IncidentStatus
    reportedAt: datetime
    modeFeas: ModeFeas
    setupRemote: float
    requirements: Requirements


class IncidentCreate(BaseModel):
    typeCode: str                                     
    componentId: Optional[str] = None
    notes: Optional[str] = None


class IncidentUpdate(BaseModel):
    status: IncidentStatus | None = None
    priority: int | None = None
    modeFeas: ModeFeas | None = None
    setupRemote: float | None = None
    requirements: Requirements | None = None


class IncidentInDB(IncidentBase):
    id: str = Field(alias="_id")
    dispatch: DispatchInfo | None = None

    model_config = {"populate_by_name": True}
