
# FortiBot

FortiBot is an AI-powered conversational assistant for Fortinet Consulting System Engineers. It analyzes technical documentation and answers specific questions about Fortinet products, particularly FortiManager and FortiAnalyzer.

## Technologies Used

- **Backend**: Python with FastAPI
- **AI**: Mistral AI models for embeddings and response generation
- **Vector Indexing**: FAISS
- **Frontend**: HTML/CSS/JS (single-page interface)

## Main Features

- **Documentation Upload**: Support for PDF and TXT files
- **Document Processing**: Automatic segmentation into optimized chunks
- **Semantic Vectorization**: Converting segments into vectors via Mistral Embed
- **Contextual Search**: Identification of the most relevant segments for each question
- **Response Generation**: Contextual synthesis based on documentation
- **Session Management**: Conversation history preservation
- **Intuitive User Interface**: Simple navigation between conversations

## Project Structure

```
ft_chatbot/
├── app/                    # Main source code
│   ├── config.py           # Configuration and global variables
│   ├── doc_processing.py   # Document processing
│   ├── main.py             # FastAPI entry point
│   ├── routes.py           # API Endpoints
│   ├── session_manager.py  # Session management
│   └── utils.py            # Utility functions
├── data/                   # Data storage
│   └── uploads/            # Uploaded documents
├── static/                 # Static files
│   ├── css/                # Styles
│   └── js/                 # Frontend scripts
└── requirements.txt        # Python dependencies
```

## Installation and Setup

### Prerequisites
- Python 3.9+ 
- Pip

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/mAndreaPoli/ft_chatbot.git
   cd FortiBot/ft_chatbot
   ```

2. Create a virtual environment
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies
   ```bash
   pip install -r requirements.txt
   ```

4. Configure the Mistral API key
   
   Create a `.env` file at the project root:
   ```
   MISTRAL_API_KEY=your_api_key
   ```

5. Launch the application
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

6. Access the web interface at [http://localhost:8000](http://localhost:8000)

## Main API Endpoints

- `POST /upload`: Document upload and processing
- `POST /ask`: Submit questions to the chatbot
- `GET /sessions`: List of conversations
- `GET /session/{session_id}`: Conversation details
- `DELETE /session/{session_id}`: Delete a conversation
- `DELETE /document/{filename}`: Delete a document
- `GET /status`: System status and indexed documents

## Limitations and Precautions

- The application is designed for internal and prototype use.
- Responses are limited to information present in the uploaded documents.
- Processing very large documents may require significant resources.
- Document confidentiality depends on securing the hosting server.

## License

This project is licensed under the MIT License. See the LICENSE file for details.

---

*Developed internally at Fortinet for prototyping purposes as part of an internship project.*
