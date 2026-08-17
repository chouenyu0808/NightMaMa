"""User profile, emergency contacts, addresses, session status and conversation history."""
from fastapi import APIRouter, Depends
from google.cloud import firestore

from clients import firestore_client
from deps import get_firestore
from models.schemas import (
    ConversationHistoryResponse,
    ConversationMessage,
    EmergencyContact,
    EmergencyContactsRequest,
    SavedAddresses,
    UserProfile,
)

router = APIRouter(prefix="/users/{user_id}")


@router.get("/profile", response_model=UserProfile)
def get_profile(user_id: str, db: firestore.Client = Depends(get_firestore)) -> UserProfile:
    return UserProfile(**firestore_client.get_profile(db, user_id))


@router.put("/profile", response_model=UserProfile)
def set_profile(
    user_id: str, profile: UserProfile, db: firestore.Client = Depends(get_firestore)
) -> UserProfile:
    firestore_client.set_profile(db, user_id, profile.name, profile.phone)
    return profile


@router.get("/contacts", response_model=EmergencyContactsRequest)
def get_contacts(user_id: str, db: firestore.Client = Depends(get_firestore)) -> EmergencyContactsRequest:
    contacts = firestore_client.get_emergency_contacts(db, user_id)
    return EmergencyContactsRequest(contacts=[EmergencyContact(**c) for c in contacts])


@router.put("/contacts", response_model=EmergencyContactsRequest)
def set_contacts(
    user_id: str, req: EmergencyContactsRequest, db: firestore.Client = Depends(get_firestore)
) -> EmergencyContactsRequest:
    firestore_client.set_emergency_contacts(db, user_id, [c.model_dump() for c in req.contacts])
    return req


@router.get("/addresses", response_model=SavedAddresses)
def get_addresses(user_id: str, db: firestore.Client = Depends(get_firestore)) -> SavedAddresses:
    return SavedAddresses(**firestore_client.get_addresses(db, user_id))


@router.put("/addresses", response_model=SavedAddresses)
def set_addresses(
    user_id: str, req: SavedAddresses, db: firestore.Client = Depends(get_firestore)
) -> SavedAddresses:
    firestore_client.set_addresses(db, user_id, req.home, req.work)
    return req


@router.get("/sessions/{session_id}")
def get_session(
    user_id: str, session_id: str, db: firestore.Client = Depends(get_firestore)
) -> dict:
    return firestore_client.get_session_status(db, user_id, session_id)


@router.get("/sessions/{session_id}/messages", response_model=ConversationHistoryResponse)
def get_conversation(
    user_id: str, session_id: str, limit: int = 50, db: firestore.Client = Depends(get_firestore)
) -> ConversationHistoryResponse:
    messages = firestore_client.get_conversation_history(db, user_id, session_id, limit=limit)
    return ConversationHistoryResponse(messages=messages)


@router.post("/sessions/{session_id}/messages", status_code=201)
def add_message(
    user_id: str, session_id: str, msg: ConversationMessage, db: firestore.Client = Depends(get_firestore)
) -> dict:
    firestore_client.add_conversation_message(db, user_id, session_id, msg.role, msg.text)
    return {"status": "saved"}
