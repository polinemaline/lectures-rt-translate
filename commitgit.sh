#!/usr/bin/env bash

EXCLUDE_DIR="backend/uploads-data"

cd ~/lectures-rt-translate || exit 1

git reset
git add -A -- . ":(exclude)$EXCLUDE_DIR"
git restore --staged -- "$EXCLUDE_DIR" 2>/dev/null

git status --short
echo

read -r -p "введите комментарий: " COMMIT_MSG

while true; do
	git commit -m "$COMMIT_MSG" && break

	echo
	echo "коммит не прошел"
	echo

	git add -A -- . ":(exclude)$EXCLUDE_DIR)"
	git restore --staged -- "$EXCLUDE_DIR" 2>/dev/null

	read -r -p "нажми enter или ctrl+c" _
done
