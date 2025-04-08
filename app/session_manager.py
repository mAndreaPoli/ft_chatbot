import json
from datetime import datetime, timedelta
from pathlib import Path
from mistralai.models.chat_completion import ChatMessage

from app.config import (
    session_history, SESSIONS_FILE,
    MAX_HISTORY_MESSAGES, MAX_TOKENS_HISTORY,
    SESSION_TIMEOUT_MINUTES, MAX_STORED_SESSIONS
)

def save_session_history():
    try:
        serializable_sessions = {}
        for session_id, session_data in session_history.items():
            session_copy = session_data.copy()
            session_copy["last_activity"] = session_copy["last_activity"].timestamp()
            session_copy["created_at"] = session_copy.get("created_at", datetime.now()).timestamp()
            serializable_sessions[session_id] = session_copy
            
        with open(SESSIONS_FILE, 'w') as f:
            json.dump(serializable_sessions, f, indent=2)
        
        print(f"Historique des sessions sauvegardé ({len(session_history)} sessions)")
        return True
    except Exception as e:
        print(f"Erreur lors de la sauvegarde des sessions: {str(e)}")
        return False

def load_session_history():
    global session_history
    try:
        if Path(SESSIONS_FILE).exists():
            with open(SESSIONS_FILE, 'r') as f:
                serialized_sessions = json.load(f)
                
                for sid, sdata in serialized_sessions.items():
                    sdata["last_activity"] = datetime.fromtimestamp(sdata["last_activity"])
                    sdata["created_at"] = datetime.fromtimestamp(sdata["created_at"])
                    session_history[sid] = sdata
                
                print(f"Historique des sessions chargé ({len(session_history)} sessions)")
                return True
    except Exception as e:
        print(f"Erreur lors du chargement des sessions: {str(e)}")
        session_history = {}
    return False

def generate_session_title(first_question):
    question = first_question.replace("\n", " ")
    if len(question) > 40:
        return question[:37] + "..."
    return question

def create_or_update_session(session_id, first_question=None):
    now = datetime.now()
    if session_id not in session_history:
        session_history[session_id] = {
            "title": first_question[:40] + "..." if first_question and len(first_question) > 40 else first_question or "Nouvelle conversation",
            "messages": [],
            "last_activity": now,
            "created_at": now
        }
    else:
        session_history[session_id]["last_activity"] = now

def add_message_to_history(session_id, role, content):
    if session_id in session_history:
        session_history[session_id]["messages"].append({
            "role": role,
            "content": content
        })
        
        if len(session_history[session_id]["messages"]) > MAX_HISTORY_MESSAGES:
            session_history[session_id]["messages"] = session_history[session_id]["messages"][-MAX_HISTORY_MESSAGES:]
        
        session_history[session_id]["last_activity"] = datetime.now()
        
        if role == "user" and len(session_history[session_id]["messages"]) == 1:
            session_history[session_id]["title"] = generate_session_title(content)
        
        save_session_history()

def get_session_messages(session_id):
    if session_id in session_history:
        return session_history[session_id]["messages"]
    return []

def get_chat_messages_with_history(session_id, system_prompt, current_question):
    chat_messages = [ChatMessage(role="system", content=system_prompt)]
    
    history_messages = get_session_messages(session_id)
    for msg in history_messages:
        chat_messages.append(ChatMessage(role=msg["role"], content=msg["content"]))
    
    chat_messages.append(ChatMessage(role="user", content=current_question))
    
    estimated_tokens = sum(len(msg.content.split()) * 1.3 for msg in chat_messages)
    if estimated_tokens > MAX_TOKENS_HISTORY:
        system_message = chat_messages[0]
        current_question_message = chat_messages[-1]
        reduced_history = history_messages[-(MAX_HISTORY_MESSAGES//2):]
        
        chat_messages = [system_message]
        for msg in reduced_history:
            chat_messages.append(ChatMessage(role=msg["role"], content=msg["content"]))
        chat_messages.append(current_question_message)
    
    return chat_messages

def clean_expired_sessions():
    expired_time = datetime.now() - timedelta(minutes=SESSION_TIMEOUT_MINUTES)
    expired_sessions = [
        sid for sid, data in session_history.items()
        if data["last_activity"] < expired_time
    ]
    
    for sid in expired_sessions:
        del session_history[sid]
    
    if len(session_history) > MAX_STORED_SESSIONS:
        sessions_by_age = sorted(
            session_history.items(),
            key=lambda x: x[1]["last_activity"]
        )
        to_remove = sessions_by_age[:len(sessions_by_age) - MAX_STORED_SESSIONS]
        for sid, _ in to_remove:
            del session_history[sid]
    
    if expired_sessions or len(session_history) > MAX_STORED_SESSIONS:
        save_session_history()

def clear_session(session_id):
    if session_id in session_history:
        del session_history[session_id]
        save_session_history()
        return True
    return False
