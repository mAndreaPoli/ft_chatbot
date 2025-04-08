import io
import json
import pickle
import traceback
import numpy as np
import faiss
import PyPDF2

from app.config import (
    index, chunks, chunk_metadata, processed_docs, processing_status,
    DATA_DIR, UPLOADS_DIR,
    INDEX_FILE, CHUNKS_FILE, METADATA_FILE, PROCESSED_DOCS_FILE,
    CHUNK_SIZE, CHUNK_OVERLAP, TOP_K,
    client
)
from app.utils import calculate_content_hash
from pathlib import Path

def assign_global_index(new_index):
    import sys
    config_module = sys.modules.get('app.config')
    if config_module:
        config_module.index = new_index
        return True
    return False

def load_index_and_data():
    try:
        if PROCESSED_DOCS_FILE.exists():
            with open(PROCESSED_DOCS_FILE, 'r') as f:
                processed_docs[:] = json.load(f)
        
        if INDEX_FILE.exists() and CHUNKS_FILE.exists() and METADATA_FILE.exists():
            loaded_index = faiss.read_index(str(INDEX_FILE))
            
            with open(CHUNKS_FILE, 'rb') as f:
                loaded_chunks = pickle.load(f)
            with open(METADATA_FILE, 'rb') as f:
                loaded_meta = pickle.load(f)
            
            chunks.clear()
            chunks.extend(loaded_chunks)
            
            chunk_metadata.clear()
            chunk_metadata.extend(loaded_meta)
            
            print(f"Index et données chargés ({len(chunks)} chunks, {len(processed_docs)} documents)")
            
            if loaded_index.ntotal != len(chunks):
                print(f"ATTENTION: Désynchro index ({loaded_index.ntotal}) vs chunks ({len(chunks)})")
            
            assign_global_index(loaded_index)
            return loaded_index
    except Exception as e:
        print(f"Erreur lors du chargement: {str(e)}")
        chunks.clear()
        chunk_metadata.clear()
        processed_docs.clear()
    
    return None

def save_index_and_data():
    import sys
    config_module = sys.modules.get('app.config')
    current_index = config_module.index if config_module else None
    
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    if current_index is not None and len(chunks) > 0:
        try:
            print(f"Sauvegarde de l'index dans {INDEX_FILE}")
            faiss.write_index(current_index, str(INDEX_FILE))
            
            print(f"Sauvegarde des chunks dans {CHUNKS_FILE}")
            with open(CHUNKS_FILE, 'wb') as f:
                pickle.dump(chunks, f)
            
            print(f"Sauvegarde des métadonnées dans {METADATA_FILE}")
            with open(METADATA_FILE, 'wb') as f:
                pickle.dump(chunk_metadata, f)
            
            print(f"Sauvegarde des documents traités dans {PROCESSED_DOCS_FILE}")
            with open(PROCESSED_DOCS_FILE, 'w') as f:
                json.dump(processed_docs, f, indent=2)
            
            print(f"Index et données sauvegardés ({len(chunks)} chunks, {len(processed_docs)} documents)")
            return True
        except Exception as e:
            print(f"Erreur lors de la sauvegarde: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    else:
        print(f"Rien à sauvegarder: index est {'None' if current_index is None else 'ok'}, chunks est {'vide' if len(chunks) == 0 else 'ok'}")
        return False

def debug_chunks_info(filename):
    matching_docs = [doc for doc in processed_docs if doc["filename"] == filename]
    
    if not matching_docs:
        print(f"Aucun document trouvé: {filename}")
        return
    
    doc = matching_docs[0]
    print(f"\nInfos document '{filename}':")
    print(f"Hash: {doc['hash']}")
    print(f"Chunks: {len(doc['chunks'])} indices")
    
    invalid_chunks = [idx for idx in doc["chunks"] if idx >= len(chunks)]
    if invalid_chunks:
        print(f"ATTENTION: {len(invalid_chunks)} indices invalides: {invalid_chunks[:5]}...")
    
    sample_size = min(3, len(doc['chunks']))
    for i in range(sample_size):
        c_idx = doc['chunks'][i]
        if c_idx < len(chunks):
            text = chunks[c_idx]
            meta = chunk_metadata[c_idx] if c_idx < len(chunk_metadata) else "Pas de métadonnées"
            print(f"\nChunk #{i+1} (index {c_idx}):")
            print(f"Métadonnées: {meta}")
            print(f"Texte (100 premiers chars): {text[:100]}...")
        else:
            print(f"Index {c_idx} hors limites")

def process_existing_chunks():
    if not chunks:
        return False
    
    try:
        embeddings = []
        batch_size = 10
        
        for i in range(0, len(chunks), batch_size):
            batch_text = chunks[i:i + batch_size]
            resp = client.embeddings(model="mistral-embed", input=batch_text)
            batch_embeddings = [item.embedding for item in resp.data]
            embeddings.extend(batch_embeddings)
        
        if embeddings:
            dim = len(embeddings[0])
            new_index = faiss.IndexFlatL2(dim)
            embeddings_np = np.array(embeddings).astype('float32')
            faiss.normalize_L2(embeddings_np)
            new_index.add(embeddings_np)
            
            assign_global_index(new_index)
            return True
    except Exception as e:
        print(f"Erreur reconstruction index: {str(e)}")
    return False

async def process_files_in_background(files_content, filenames, file_paths):

    from app import config

    try:
        processing_status["is_processing"] = True
        processing_status["total_files"] = len(files_content)
        processing_status["processed_files"] = 0
        processing_status["chunks_created"] = 0
        
        if config.index is None and chunks:
            process_existing_chunks()
        elif config.index is None:
            vector_dimension = 1024
            config.index = faiss.IndexFlatL2(vector_dimension)
        
        new_chunks = []
        new_chunk_metadata = []
        embeddings = []
        
        for (content, filename, file_path) in zip(files_content, filenames, file_paths):
            file_hash = calculate_content_hash(content)
            existing_doc_index = None
            for j, doc in enumerate(processed_docs):
                if doc["filename"] == filename:
                    existing_doc_index = j
                    break
            
            if existing_doc_index is not None:
                if processed_docs[existing_doc_index]["hash"] == file_hash:
                    print(f"Fichier {filename} inchangé, ignoré.")
                    processing_status["processed_files"] += 1
                    continue
                else:
                    print(f"Fichier {filename} modifié, suppression ancienne version.")
                    processed_docs.pop(existing_doc_index)
            
            start_idx = len(chunks)
            current_file_chunks = []
            
            if filename.endswith('.pdf'):
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
                print(f"Traitement PDF: {filename}, {len(pdf_reader.pages)} pages")
                
                for page_num, page in enumerate(pdf_reader.pages):
                    page_text = page.extract_text() or ""
                    if not page_text.strip():
                        print(f"Page {page_num+1} vide dans {filename}")
                        continue
                    for i in range(0, len(page_text), CHUNK_SIZE - CHUNK_OVERLAP):
                        chunk_text = page_text[i:i+CHUNK_SIZE]
                        if chunk_text.strip():
                            new_chunks.append(chunk_text)
                            current_file_chunks.append(len(chunks) + len(new_chunks) - 1)
                            new_chunk_metadata.append({
                                "source": filename,
                                "page": page_num + 1,
                                "type": "pdf",
                                "start_char": i,
                                "length": len(chunk_text),
                                "deleted": False
                            })
                            processing_status["chunks_created"] += 1
            
            elif filename.endswith('.txt'):
                text = content.decode('utf-8', errors='ignore')
                print(f"Traitement TXT: {filename}, {len(text)} caractères")
                for i in range(0, len(text), CHUNK_SIZE - CHUNK_OVERLAP):
                    chunk_text = text[i:i+CHUNK_SIZE]
                    if chunk_text.strip():
                        new_chunks.append(chunk_text)
                        current_file_chunks.append(len(chunks) + len(new_chunks) - 1)
                        new_chunk_metadata.append({
                            "source": filename,
                            "type": "txt",
                            "start_char": i,
                            "length": len(chunk_text),
                            "deleted": False
                        })
                        processing_status["chunks_created"] += 1

            new_doc = {
                "filename": filename,
                "hash": file_hash,
                "chunks": current_file_chunks
            }
            processed_docs.append(new_doc)
            print(f"Document {filename}, {len(current_file_chunks)} chunks")
            processing_status["processed_files"] += 1
        
        if new_chunks:
            print(f"Vectorisation de {len(new_chunks)} chunks...")
            batch_size = 10
            for i in range(0, len(new_chunks), batch_size):
                batch_end = i + batch_size
                batch_text = new_chunks[i:batch_end]
                resp = client.embeddings(model="mistral-embed", input=batch_text)
                batch_embeddings = [item.embedding for item in resp.data]
                embeddings.extend(batch_embeddings)
                print(f"Lot {i//batch_size + 1} vectorisé")
            
            chunks.extend(new_chunks)
            chunk_metadata.extend(new_chunk_metadata)
            
            if embeddings:
                embeddings_np = np.array(embeddings).astype('float32')
                faiss.normalize_L2(embeddings_np)
                config.index.add(embeddings_np)
                print(f"Index mis à jour, {config.index.ntotal} vecteurs")
                result = save_index_and_data()
                if result:
                    print("Données sauvegardées avec succès.")
                else:
                    print("ERREUR: Échec de la sauvegarde des données!")
    except Exception as e:
        print(f"Erreur process background: {str(e)}")
        traceback.print_exc()
    finally:
        processing_status["is_processing"] = False
