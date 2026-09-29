import hashlib
import hmac

from backend.config import settings
from backend.schemas.plan import InterviewPlan, SignedPlan


def signature_of(plan: InterviewPlan) -> str:
    # same plan -> same JSON -> same signature. Without the key nobody can make a new one
    key = settings.plan_signing_key.get_secret_value().encode()
    return hmac.new(key, plan.model_dump_json().encode(), hashlib.sha256).hexdigest()


def sign_plan(plan: InterviewPlan) -> SignedPlan:
    return SignedPlan(plan=plan, signature=signature_of(plan))


def is_signed(signed: SignedPlan) -> bool:
    return hmac.compare_digest(signature_of(signed.plan), signed.signature)
