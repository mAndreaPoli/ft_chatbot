import os
import hashlib
import json
import pickle
import faiss
import numpy as np
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")

from mistralai.client import MistralClient
from mistralai.models.chat_completion import ChatMessage

client = MistralClient(api_key=MISTRAL_API_KEY)

DATA_DIR = Path("data")
UPLOADS_DIR = DATA_DIR / "uploads"
INDEX_FILE = DATA_DIR / "faiss_index.bin"
CHUNKS_FILE = DATA_DIR / "chunks.pkl"
METADATA_FILE = DATA_DIR / "metadata.pkl"
PROCESSED_DOCS_FILE = DATA_DIR / "processed_docs.json"
SESSIONS_FILE = DATA_DIR / "sessions.json"

CHUNK_SIZE = 512
CHUNK_OVERLAP = 128
TOP_K = 3

MAX_HISTORY_MESSAGES = 6
SESSION_TIMEOUT_MINUTES = 30
MAX_TOKENS_HISTORY = 8000
MAX_STORED_SESSIONS = 20

index = None
chunks = []
chunk_metadata = []
processed_docs = []

processing_status = {
    "is_processing": False,
    "total_files": 0,
    "processed_files": 0,
    "chunks_created": 0
}

session_history = {}
