from fastapi import (
    APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
)
from typing import List, Optional
import os
import uuid
from datetime import datetime
import numpy as np
import faiss
import PyPDF2

import app.config as config

from app.config import (
    processing_status, processed_docs, chunks, chunk_metadata,
    UPLOADS_DIR, TOP_K, client, session_history
)

from app.doc_processing import (
    process_files_in_background, debug_chunks_info, process_existing_chunks,
    load_index_and_data, save_index_and_data
)
from app.session_manager import (
    create_or_update_session, add_message_to_history, get_session_messages,
    get_chat_messages_with_history, clean_expired_sessions, clear_session,
    load_session_history, save_session_history
)

router = APIRouter()

@router.get("/status")
async def get_status():
    docs_info = {
        "total_documents": len(processed_docs),
        "document_list": [doc["filename"] for doc in processed_docs],
        "total_chunks": len(chunks),
        "index_vectors": config.index.ntotal if config.index else 0
    }
    return {**processing_status, **docs_info}

@router.post("/upload")
async def upload_pdfs(files: List[UploadFile] = File(...), background_tasks: BackgroundTasks = None):
    if processing_status["is_processing"]:
        raise HTTPException(status_code=400, detail="Un traitement de documents est déjà en cours")
    
    try:
        files_content = []
        filenames = []
        file_paths = []
        
        for file in files:
            if file.filename.endswith('.pdf') or file.filename.endswith('.txt'):
                content = await file.read()
                os.makedirs(UPLOADS_DIR, exist_ok=True)
                file_path = UPLOADS_DIR / file.filename
                with open(file_path, "wb") as f:
                    f.write(content)
                
                files_content.append(content)
                filenames.append(file.filename)
                file_paths.append(file_path)
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"{file.filename} n'est pas un fichier supporté (PDF ou TXT)"
                )
        
        background_tasks.add_task(process_files_in_background, files_content, filenames, file_paths)
        return {
            "status": "processing",
            "message": f"Traitement de {len(files)} fichiers en cours. Consultez /status pour suivre l'avancement."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ask")
async def ask_question(question: str = Form(...), session_id: Optional[str] = Form(None)):
    clean_expired_sessions()
    
    import sys
    config_module = sys.modules.get('app.config')
    current_index = config_module.index if config_module else None
    
    print(f"Debug ask_question: index={current_index is not None}, chunks={len(chunks)}")
    
    if current_index is None or current_index.ntotal == 0 or len(chunks) == 0:
        raise HTTPException(status_code=400, detail="Aucun document n'a été chargé. Veuillez d'abord uploader des PDFs.")
    
    if not session_id:
        session_id = str(uuid.uuid4())
    create_or_update_session(session_id, question)
    
    try:
        question_embedding_resp = client.embeddings(
            model="mistral-embed",
            input=[question]
        )
        question_embedding = question_embedding_resp.data[0].embedding
        question_np = np.array([question_embedding]).astype('float32')
        faiss.normalize_L2(question_np)
        
        extended_k = TOP_K * 4
        distances, indices_ = current_index.search(question_np, extended_k)
                
        seen_sources = set()
        diverse_context_parts = []
        diverse_sources = []
        
        for i, idx_ in enumerate(indices_[0]):
            if len(diverse_context_parts) >= TOP_K:
                break
            if idx_ >= len(chunks) or idx_ >= len(chunk_metadata):
                continue
            chunk_text = chunks[idx_]
            meta = chunk_metadata[idx_]
            src = meta["source"]
            if src not in seen_sources or len(diverse_context_parts) < TOP_K / 2:
                seen_sources.add(src)
                if meta["type"] == "pdf":
                    source_info = f"{meta['source']} (page {meta['page']})"
                else:
                    source_info = meta["source"]
                if source_info not in diverse_sources:
                    diverse_sources.append(source_info)
                
                diverse_context_parts.append(
                    f"Extrait {len(diverse_context_parts)+1} (source: {source_info}):\n{chunk_text}"
                )
        
        if len(diverse_context_parts) < TOP_K:
            for i, idx_ in enumerate(indices_[0]):
                if len(diverse_context_parts) >= TOP_K:
                    break
                if idx_ >= len(chunks) or idx_ >= len(chunk_metadata):
                    continue
                chunk_text = chunks[idx_]
                meta = chunk_metadata[idx_]
                already_included = any(chunk_text in part for part in diverse_context_parts)
                if not already_included:
                    if meta["type"] == "pdf":
                        source_info = f"{meta['source']} (page {meta['page']})"
                    else:
                        source_info = meta["source"]
                    if source_info not in diverse_sources:
                        diverse_sources.append(source_info)
                    
                    diverse_context_parts.append(
                        f"Extrait {len(diverse_context_parts)+1} (source: {source_info}):\n{chunk_text}"
                    )
        
        context = "\n\n".join(diverse_context_parts)
        
        system_prompt = f"""You are a technical assistant specialized in Fortinet products.
        Answer questions only based on the information provided in the context below.
        If the answer is not in the context, simply state that you cannot answer this question based on the available information.
        Do not invent information and be precise in your answers.
        Format your response using Markdown for better readability:
        - Use **bold** for important terms
        - Use bullet points for lists
        - Use headings with # or ## for sections
        - Use `code formatting` for configuration examples or commands

        Always respond in English, regardless of the language of the question.

        Context:
        {context}"""
        
        messages = get_chat_messages_with_history(session_id, system_prompt, question)
        chat_response = client.chat(
            model="mistral-large-latest",
            messages=messages,
            temperature=0.1,
            max_tokens=1024
        )
        answer = chat_response.choices[0].message.content
        
        add_message_to_history(session_id, "user", question)
        add_message_to_history(session_id, "assistant", answer)
        
        return {
            "answer": answer,
            "sources": diverse_sources,
            "session_id": session_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/diagnosis/{filename}")
async def diagnose_document(filename: str):
    matching_docs = [doc for doc in processed_docs if doc["filename"] == filename]
    if not matching_docs:
        raise HTTPException(status_code=404, detail=f"Document '{filename}' non trouvé")
    doc = matching_docs[0]
    result = {
        "filename": doc["filename"],
        "hash": doc["hash"],
        "total_chunks": len(doc["chunks"]),
    }
    chunks_info = []
    for i, chunk_idx in enumerate(doc["chunks"][:5]):
        if chunk_idx < len(chunks) and chunk_idx < len(chunk_metadata):
            chunks_info.append({
                "index": chunk_idx,
                "metadata": chunk_metadata[chunk_idx],
                "text_preview": chunks[chunk_idx][:100] + "..."
            })
        else:
            chunks_info.append({
                "index": chunk_idx,
                "error": "Indice de chunk invalide"
            })
    result["chunks_sample"] = chunks_info
    return result

@router.get("/sessions")
async def get_sessions():
    clean_expired_sessions()
    sessions_list = []
    for sid, sdata in session_history.items():
        title = sdata.get("title", "Nouvelle conversation")
        created_at = sdata.get("created_at", datetime.now()).isoformat()
        last_activity = sdata.get("last_activity", datetime.now()).isoformat()
        message_count = len(sdata.get("messages", []))
        sessions_list.append({
            "id": sid,
            "title": title,
            "created_at": created_at,
            "last_activity": last_activity,
            "message_count": message_count
        })
    sessions_list.sort(key=lambda x: x["last_activity"], reverse=True)
    return {"sessions": sessions_list}

@router.get("/session/{session_id}")
async def get_session_details(session_id: str):
    if session_id not in session_history:
        raise HTTPException(status_code=404, detail="Session non trouvée")
    session_history[session_id]["last_activity"] = datetime.now()
    sdata = session_history[session_id]
    return {
        "id": session_id,
        "title": sdata.get("title", "Nouvelle conversation"),
        "created_at": sdata.get("created_at", datetime.now()).isoformat(),
        "last_activity": sdata["last_activity"].isoformat(),
        "messages": sdata["messages"]
    }

@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    if clear_session(session_id):
        return {"message": f"Session {session_id} supprimée avec succès"}
    raise HTTPException(status_code=404, detail="Session non trouvée")

@router.delete("/document/{filename}")
async def delete_document(filename: str):
    matches = [i for i, doc in enumerate(processed_docs) if doc["filename"] == filename]
    if not matches:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    doc_idx = matches[0]
    doc = processed_docs[doc_idx]
    print(f"Suppression du doc: {filename}, {len(doc['chunks'])} chunks")
    
    processed_docs.pop(doc_idx)
    file_path = UPLOADS_DIR / filename
    if file_path.exists():
        os.remove(file_path)
        print(f"Fichier supprimé: {file_path}")
    save_index_and_data()
    return {"message": f"Document {filename} supprimé avec succès"}

@router.get("/debug/document/{filename}")
async def debug_document(filename: str):
    debug_chunks_info(filename)
    return {"message": "Infos de debug dans les logs"}

@router.get("/reconstruct-index")
async def reconstruct_index(background_tasks: BackgroundTasks):
    if processing_status["is_processing"]:
        raise HTTPException(status_code=400, detail="Un traitement est déjà en cours")
    
    async def rebuild_in_background():
        try:
            processing_status["is_processing"] = True
            ok = process_existing_chunks()
            if ok:
                save_index_and_data()
                return {"message": "Index reconstruit avec succès"}
            else:
                return {"message": "Échec de la reconstruction de l'index"}
        finally:
            processing_status["is_processing"] = False
    
    background_tasks.add_task(rebuild_in_background)
    return {"message": "Reconstruction lancée en arrière-plan"}

@router.post("/reindex-document/{filename}")
async def reindex_document(filename: str, background_tasks: BackgroundTasks):
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"{filename} n'existe pas")
    if processing_status["is_processing"]:
        raise HTTPException(status_code=400, detail="Un traitement est déjà en cours")
    
    existing_docs = [i for i, doc in enumerate(processed_docs) if doc["filename"] == filename]
    if existing_docs:
        for idx in sorted(existing_docs, reverse=True):
            processed_docs.pop(idx)
    
    with open(file_path, "rb") as f:
        content = f.read()
    
    async def process_single():
        await process_files_in_background([content], [filename], [file_path])
    
    background_tasks.add_task(process_single)
    return {
        "status": "processing",
        "message": f"Réindexation de {filename} lancée. Consultez /status pour l'avancement."
    }

@router.get("/raw-pdf/{filename}")
async def get_raw_pdf_text(filename: str):
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"{filename} n'existe pas")
    try:
        pdf_reader = PyPDF2.PdfReader(file_path)
        pages_text = []
        for page_num, page in enumerate(pdf_reader.pages):
            text = page.extract_text() or ""
            pages_text.append({
                "page_number": page_num + 1,
                "text": text,
                "text_length": len(text)
            })
        return {
            "filename": filename,
            "total_pages": len(pdf_reader.pages),
            "pages": pages_text
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/debug/files")
async def debug_files():
    from app.config import DATA_DIR
    
    files = []
    if DATA_DIR.exists():
        for file in DATA_DIR.iterdir():
            files.append({
                "name": file.name,
                "size": file.stat().st_size if file.is_file() else None,
                "type": "file" if file.is_file() else "directory",
                "last_modified": datetime.fromtimestamp(file.stat().st_mtime).isoformat() if file.exists() else None
            })
    
    upload_files = []
    upload_dir = DATA_DIR / "uploads"
    if upload_dir.exists():
        for file in upload_dir.iterdir():
            if file.is_file():
                upload_files.append({
                    "name": file.name,
                    "size": file.stat().st_size,
                    "last_modified": datetime.fromtimestamp(file.stat().st_mtime).isoformat()
                })
    
    return {
        "data_dir_exists": DATA_DIR.exists(),
        "data_dir_path": str(DATA_DIR),
        "files": files,
        "upload_files": upload_files
    }