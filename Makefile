# Common tasks. On Windows use the commands in README.md directly.
PY ?= python

.PHONY: install install-backend install-frontend analysis api dashboard test lint up

install: install-backend install-frontend

install-backend:
	cd backend && $(PY) -m pip install -r requirements-dev.txt

install-frontend:
	cd frontend && npm ci

analysis:          ## full LP + GP analysis, writes backend/outputs/
	cd backend && $(PY) src/main.py

api:               ## planner API on :8000
	cd backend/src && $(PY) -m uvicorn api:app --reload --port 8000

dashboard:         ## Vite dev server on :3000
	cd frontend && npm run dev

test:
	cd backend && $(PY) -m pytest -q
	cd frontend && npm test && npm run verify

lint:
	cd backend && ruff check src tests && ruff format --check src tests && mypy
	cd frontend && npm run lint

up:                ## run everything in Docker
	docker compose up --build
