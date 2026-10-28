from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.integrations.base import PROVIDERS
from app.models import User
from app.schemas import ProviderInfo

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/providers", response_model=list[ProviderInfo])
def list_providers(_: User = Depends(get_current_user)) -> list[ProviderInfo]:
    return [
        ProviderInfo(
            name=provider.info.name,
            mode=provider.info.mode,
            available=provider.info.available,
            description=provider.info.description,
        )
        for provider in PROVIDERS
    ]
