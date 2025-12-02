.PHONY: up down logs build backend-install frontend-install

up:
	docker compose -f docker-compose.dev.yml up --build

down:
	docker compose -f docker-compose.dev.yml down

logs:
	docker compose -f docker-compose.dev.yml logs -f

build:
	docker compose -f docker-compose.dev.yml build

backend-install:
	cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r app/requirements.txt

frontend-install:
	cd frontend && npm ci
