try:
    import app.dns_fix  # noqa: F401 - Patch DNS for MongoDB SRV on Windows
except Exception:
    pass
import os
import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port)
