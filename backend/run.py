import app.dns_fix  # noqa: F401 - Patch DNS for MongoDB SRV on Windows
import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
