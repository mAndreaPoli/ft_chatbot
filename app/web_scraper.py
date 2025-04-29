import requests
from bs4 import BeautifulSoup
import os
import time
import re
import json
from urllib.parse import urljoin, urlparse
from pathlib import Path
from typing import List, Dict, Set

from app.config import (
    UPLOADS_DIR,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    processing_status
)
from app.utils import calculate_content_hash

class WebScraper:
    def __init__(self, base_url: str, output_dir: Path = None):
        self.base_url = base_url
        self.base_domain = urlparse(base_url).netloc
        self.visited_urls: Set[str] = set()
        self.output_dir = output_dir or UPLOADS_DIR
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
    def normalize_url(self, url: str) -> str:
        url = urljoin(self.base_url, url)
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    
    def should_visit(self, url: str) -> bool:
        if not url or url.startswith('#'):
            return False
            
        normalized = self.normalize_url(url)
        
        if normalized in self.visited_urls:
            return False
            
        parsed = urlparse(normalized)
        
        if parsed.netloc != self.base_domain:
            return False
            
        extensions_to_avoid = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.zip', '.tar', '.gz']
        if any(parsed.path.endswith(ext) for ext in extensions_to_avoid):
            return False
            
        return True
    
    def extract_text(self, html_content: str) -> str:
        soup = BeautifulSoup(html_content, 'html.parser')
        
        for element in soup.find_all(['script', 'style', 'nav', 'footer']):
            element.decompose()
            
        main_content = soup.find('div', class_='document')
        if main_content:
            text = main_content.get_text(separator='\n')
        else:
            text = soup.get_text(separator='\n')
        
        text = re.sub(r'\n+', '\n', text)
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
    
    def extract_title(self, html_content: str) -> str:
        soup = BeautifulSoup(html_content, 'html.parser')
        title_tag = soup.find('title')
        if title_tag:
            return title_tag.text.strip()
        h1_tag = soup.find('h1')
        if h1_tag:
            return h1_tag.text.strip()
        return "Sans titre"
        
    def extract_links(self, html_content: str, current_url: str) -> List[str]:
        soup = BeautifulSoup(html_content, 'html.parser')
        links = []
        
        for a_tag in soup.find_all('a', href=True):
            href = a_tag.get('href')
            if self.should_visit(href):
                absolute_url = urljoin(current_url, href)
                links.append(absolute_url)
                
        return links
    
    def crawl(self, start_url: str = None, max_pages: int = 100) -> List[Dict]:
        start_url = start_url or self.base_url
        pages_to_visit = [start_url]
        crawled_pages = []
        page_count = 0
        
        processing_status["is_processing"] = True
        processing_status["total_files"] = max_pages
        processing_status["processed_files"] = 0
        processing_status["chunks_created"] = 0
        
        while pages_to_visit and page_count < max_pages:
            url = pages_to_visit.pop(0)
            normalized_url = self.normalize_url(url)
            
            if normalized_url in self.visited_urls:
                continue
                
            self.visited_urls.add(normalized_url)
            
            try:
                print(f"Exploration de {url}")
                response = requests.get(url, timeout=10)
                
                if response.status_code != 200:
                    print(f"Erreur {response.status_code} pour {url}")
                    continue
                    
                content_type = response.headers.get('Content-Type', '')
                if 'text/html' not in content_type:
                    print(f"Contenu non HTML: {content_type}")
                    continue
                
                page_count += 1
                processing_status["processed_files"] = page_count
                
                html_content = response.text
                page_text = self.extract_text(html_content)
                page_title = self.extract_title(html_content)
                
                if len(page_text) < 100:
                    print(f"Page {url} ignorée car contenu trop court: {len(page_text)} caractères")
                    continue
                
                url_path = urlparse(url).path
                if url_path == "" or url_path == "/":
                    filename = "index.html"
                else:
                    filename = url_path.strip('/').replace('/', '_')
                    if not filename.endswith('.html'):
                        filename += '.html'
                
                page_info = {
                    "url": url,
                    "title": page_title,
                    "text": page_text,
                    "filename": filename
                }
                
                crawled_pages.append(page_info)
                
                links = self.extract_links(html_content, url)
                for link in links:
                    if link not in self.visited_urls and link not in pages_to_visit:
                        pages_to_visit.append(link)
                
                time.sleep(0.5)
                
            except Exception as e:
                print(f"Erreur lors du traitement de {url}: {str(e)}")
        
        processing_status["is_processing"] = False
        return crawled_pages
    
    def save_pages_as_files(self, pages: List[Dict]) -> List[Dict]:
        saved_files = []
        
        for page in pages:
            text = page['text']
            title = page['title']
            url = page['url']
            filename = f"web_{urlparse(url).netloc}_{page['filename']}"
            
            filename = re.sub(r'[^\w\-_\.]', '_', filename)
            if len(filename) > 100:
                filename = filename[:100]
            
            file_path = self.output_dir / filename
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(f"Title: {title}\n")
                f.write(f"URL: {url}\n")
                f.write("\n")
                f.write(text)
            
            file_info = {
                "filename": filename,
                "path": str(file_path),
                "url": url,
                "title": title,
                "size": len(text)
            }
            
            saved_files.append(file_info)
            print(f"Page sauvegardée: {file_path}")
        
        return saved_files