.PHONY: help test preview watch archive-deployments

help:
	@echo "Ladderboard — local dev commands (none of this touches apps-script/'s clasp push):"
	@echo "  make test                 run the harness's test suite (test/*.test.js)"
	@echo "  make watch                run the test suite, re-running on file changes"
	@echo "  make preview              start the local browser preview (http://localhost:3000)"
	@echo "  make archive-deployments  dry-run: show old Apps Script deployments that would be deleted"

test:
	TZ=UTC node --test test/

watch:
	TZ=UTC node --test --watch test/

preview:
	TZ=UTC node tools/preview.js

archive-deployments:
	tools/archive-deployments.sh
