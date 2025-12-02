from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api_auth import router as auth_router
from app.api_lectures import router as lectures_router

app = FastAPI()

# ---- CORS ----
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # можно поставить ["*"], если надо на всё
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


# ---- Роуты ----
# POST /api/auth/register
# POST /api/auth/login
app.include_router(auth_router, prefix="/api/auth")

# твои лекции, как раньше
app.include_router(lectures_router, prefix="/api")
