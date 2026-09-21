#!/usr/bin/env bash
#
# Downloads the benchmark structures from RCSB.
#
# Fetching happens here rather than inside a benchmark run on purpose: a
# download in the middle of a measurement puts network variance straight into
# the `load` scenario. The URL is the one the Get PDB dialog uses
# (react-gui/src/renderer/worker/shared/pdbUrls.ts), so these are byte for byte
# the files the application would open.
#
# Everything is mmCIF. The two largest entries have more chains than the PDB
# format can express and exist only as mmCIF; mixing formats would mean the
# `load` scenario compared two different readers.
#
# Usage:
#   ./fetch.sh              # the default ladder (1CRN .. 4V6X)
#   ./fetch.sh 3j3q         # one entry by id
#   ./fetch.sh --all        # the ladder plus 3J3Q (several hundred MB)

set -euo pipefail

cd "$(dirname "$0")"
DATA_DIR="data"
BASE_URL="https://files.rcsb.org/download"

# id:atoms:description -- the atom counts are approximate and only used for the
# manifest, so a reader can see the ladder without opening the files.
LADDER=(
    "1crn:327:crambin"
    "4hhb:4779:haemoglobin"
    "1aon:58674:GroEL/GroES"
    "4v6x:220000:human 80S ribosome"
)
# Kept out of the default set: the download and the parse are an order of
# magnitude beyond the rest, so it is opted into explicitly.
LARGE=("3j3q:2440800:HIV-1 capsid")

fetch_one() {
    local id="$1"
    local out="$DATA_DIR/$id.cif"
    if [ -f "$out" ]; then
        echo "  $id: already present ($(wc -c < "$out") bytes)"
        return
    fi
    echo "  $id: downloading..."
    curl -fL --retry 3 --retry-delay 2 -o "$out.gz" "$BASE_URL/$id.cif.gz"
    gunzip -f "$out.gz"
    echo "  $id: $(wc -c < "$out") bytes"
}

entries=()
case "${1:-}" in
    "")      entries=("${LADDER[@]}") ;;
    --all)   entries=("${LADDER[@]}" "${LARGE[@]}") ;;
    *)       for arg in "$@"; do entries+=("$arg:0:") ; done ;;
esac

mkdir -p "$DATA_DIR"
echo "Fetching ${#entries[@]} structure(s) into $DATA_DIR/"
for entry in "${entries[@]}"; do
    fetch_one "${entry%%:*}"
done

# A manifest so a corpus can be checked without re-downloading it.
{
    echo "{"
    echo "  \"fetched\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"source\": \"$BASE_URL/<id>.cif.gz\","
    echo "  \"entries\": ["
    first=1
    for f in "$DATA_DIR"/*.cif; do
        [ -f "$f" ] || continue
        id="$(basename "$f" .cif)"
        atoms=0
        desc=""
        for entry in "${LADDER[@]}" "${LARGE[@]}"; do
            if [ "${entry%%:*}" = "$id" ]; then
                rest="${entry#*:}"
                atoms="${rest%%:*}"
                desc="${rest#*:}"
            fi
        done
        [ $first -eq 1 ] || echo ","
        first=0
        printf '    { "id": "%s", "atoms": %s, "description": "%s", "bytes": %s, "sha256": "%s" }' \
            "$id" "$atoms" "$desc" "$(wc -c < "$f" | tr -d ' ')" "$(shasum -a 256 "$f" | cut -d' ' -f1)"
    done
    echo
    echo "  ]"
    echo "}"
} > "$DATA_DIR/manifest.json"

echo "Wrote $DATA_DIR/manifest.json"
