# app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import router as api_router
from app.api_auth import router as auth_router
from app.api_conferences import router as conferences_router
from app.api_lectures import router as lectures_router

app = FastAPI(title="Lectures RT Translate")

# ---- CORS ----
origins = [
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(api_router, prefix="/api")
app.include_router(auth_router, prefix="/api/auth")
app.include_router(lectures_router, prefix="/api")
app.include_router(conferences_router, prefix="/api")
