import os
import uuid
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import httpx



MODEL_NAME = "gpt-3.5-turbo"

app = FastAPI()

# CORS: allow frontend requests during local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

# In-memory chat storage: {chat_id: [{'role':..., 'content':...}, ...]}
chats = {}

@app.get("/api/chats")
async def get_chats():
    chat_summaries = []
    for chat_id, history in chats.items():
        title = ""
        for msg in history:
            if msg['role'] == 'user':
                title = msg['content'][:20]
                break
        chat_summaries.append({
            "id": chat_id,
            "title": title or f"Chat {chat_id[:8]}"
        })
    return chat_summaries

@app.post("/api/chats")
async def create_chat():
    chat_id = str(uuid.uuid4())
    chats[chat_id] = []
    return {"id": chat_id}

@app.get("/api/chats/{chat_id}")
async def get_chat(chat_id: str):
    if chat_id not in chats:
        raise HTTPException(404, detail="Chat not found")
    return chats[chat_id]

@app.post("/api/chats/{chat_id}/fork")
async def fork_chat(chat_id: str):
    if chat_id not in chats:
        raise HTTPException(404, detail="Chat not found")
    new_id = str(uuid.uuid4())
    chats[new_id] = [dict(m) for m in chats[chat_id]]
    return {"id": new_id}

@app.post("/api/chats/{chat_id}/message")
async def chat_with_model(chat_id: str, req: Request):
    if chat_id not in chats:
        raise HTTPException(404, detail="Chat not found")
    body = await req.json()
    user_message = body.get("message", "")
    if not user_message:
        raise HTTPException(400, detail="Missing message.")

    # Add user's message to history
    messages = chats[chat_id]
    messages.append({"role": "user", "content": user_message})

    # Call AI model
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": MODEL_NAME,
                    "messages": messages,
                }
            )
        resp.raise_for_status()
        data = resp.json()
        ai_content = data['choices'][0]['message']['content']
    except Exception as e:
        ai_content = f"[Error contacting AI model: {e}]"

    # Add assistant's reply to history
    messages.append({"role": "assistant", "content": ai_content})

    return {"role": "assistant", "content": ai_content}

@app.get("/", response_class=HTMLResponse)
async def get_index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()
