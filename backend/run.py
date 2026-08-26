"""
Run with: python run.py   (from inside backend/, with venv activated)

This just wraps the uvicorn command so you don't have to type it out
every time. Same effect as:
  uvicorn app.main:app --reload --port 8000
"""

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
