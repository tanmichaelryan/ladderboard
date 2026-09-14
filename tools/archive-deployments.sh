#!/usr/bin/env bash
# Deletes old Apps Script deployments for this project, keeping only:
#   - @HEAD (clasp's test deployment; can't be deleted anyway)
#   - the deployment with the highest @<version> number
#
# Apps Script has no "archive" state for deployments, only delete
# (clasp undeploy). This is the closest equivalent: clear out orphaned
# deployments left behind by "New deployment" instead of editing the
# existing one (see ../DEPLOY.md's "Updating after the first deploy").
#
# Usage:
#   tools/archive-deployments.sh            # dry run — shows what would be deleted
#   tools/archive-deployments.sh --yes       # actually deletes
set -euo pipefail

cd "$(dirname "$0")/../apps-script"

APPLY=false
if [[ "${1:-}" == "--yes" ]]; then
  APPLY=true
fi

echo "Fetching deployments..."
LIST="$(clasp deployments)"
echo "$LIST"
echo

# Lines look like: "- <id> @<version>" or "- <id> @HEAD"
KEEP_ID="$(echo "$LIST" | grep -oE '^- \S+ @[0-9]+' | sort -t@ -k2 -n | tail -1 | awk '{print $2}')"

if [[ -z "$KEEP_ID" ]]; then
  echo "No versioned deployments found — nothing to do."
  exit 0
fi

echo "Keeping newest versioned deployment: $KEEP_ID"
echo "Keeping @HEAD (test deployment, not deletable via undeploy anyway)"
echo

TO_DELETE=()
while read -r id ver; do
  if [[ "$ver" == "@HEAD" || "$id" == "$KEEP_ID" ]]; then
    continue
  fi
  TO_DELETE+=("$id")
done < <(echo "$LIST" | grep -oE '^- \S+ @\S+' | sed 's/^- //')

if [[ ${#TO_DELETE[@]} -eq 0 ]]; then
  echo "Nothing to delete."
  exit 0
fi

echo "Deployments to delete (${#TO_DELETE[@]}):"
printf '  %s\n' "${TO_DELETE[@]}"
echo

if ! $APPLY; then
  echo "Dry run only — re-run with --yes to actually delete these."
  exit 0
fi

for id in "${TO_DELETE[@]}"; do
  echo "Undeploying $id..."
  clasp undeploy "$id"
done

echo "Done."
