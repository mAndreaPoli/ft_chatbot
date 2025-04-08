import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse

from app.routes import router
from app.doc_processing import load_index_and_data
from app.session_manager import load_session_history, clean_expired_sessions
from app.config import index, chunks, chunk_metadata, processed_docs

app = FastAPI(title="Fortinet Chatbot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

app.mount("/static", StaticFiles(directory="static"), name="static")

def ensure_directories():
    from app.config import DATA_DIR, UPLOADS_DIR
    
    print("Vérification des répertoires...")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Répertoires vérifiés: {DATA_DIR}, {UPLOADS_DIR}")

@app.on_event("startup")
async def startup_event():
    global index
    
    ensure_directories()

    loaded_index = load_index_and_data()
    if loaded_index is not None:
        index = loaded_index
    
    load_session_history()
    clean_expired_sessions()
    
    import sys
    config_module = sys.modules.get('app.config')
    
    print("\n--- Diagnostic au démarrage ---")
    print(f"Index global dans main.py: {index is not None}")
    print(f"Index dans config: {config_module.index is not None}")
    
    if index is not None:
        print(f"Index FAISS: {index.ntotal} vecteurs")
        if index.ntotal != len(chunks):
            print(f"ATTENTION: Incohérence entre index.ntotal ({index.ntotal}) et len(chunks) ({len(chunks)})")
        if index.ntotal == 0:
            print("ATTENTION: Index FAISS vide (0 vecteurs)")
    else:
        print("Index FAISS non chargé")
    print(f"Chunks: {len(chunks)}")
    print(f"Métadonnées: {len(chunk_metadata)}")
    print(f"Documents traités: {len(processed_docs)}")

@app.on_event("shutdown")
async def shutdown_event():
    from app.doc_processing import save_index_and_data
    from app.session_manager import save_session_history
    
    print("Sauvegarde des données avant arrêt...")
    save_index_and_data()
    save_session_history()
    print("Sauvegarde terminée.")

@app.get("/", response_class=HTMLResponse)
async def root():
    with open("static/index.html", "r") as f:
        return f.read()

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
