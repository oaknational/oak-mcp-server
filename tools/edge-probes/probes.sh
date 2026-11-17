#!/bin/sh
# Prints one "ok <name>" or "FAIL <name>: <reason>" line per probe, and exits 1 if any probe fails.
# Set EDGE_PROBE_BYPASS to send it as x-vercel-protection-bypass to a protected preview.
set -u

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <host or origin, such as mcp-staging.thenational.academy>" >&2
  exit 2
fi

origin=$1
case $origin in
  http://* | https://*) ;;
  *) origin="https://$origin" ;;
esac
origin=${origin%/}

browser='text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
protocol='application/json, text/event-stream'
csp_meta_written_by_docs_build='<meta http-equiv="Content-Security-Policy"'

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
failures=0

# An empty accept sends no Accept header.
probe() {
  name=$1 method=$2 path=$3 accept=$4 want_status=$5 want_type=$6 want_origin=$7
  set -- --silent --show-error --max-time 30 --request "$method" \
    --output "$work/body" --dump-header "$work/headers" --write-out '%{http_code}' \
    --header "Accept:${accept:+ $accept}"
  if [ -n "${EDGE_PROBE_BYPASS:-}" ]; then
    set -- "$@" --header "x-vercel-protection-bypass: $EDGE_PROBE_BYPASS"
  fi
  if ! status=$(curl "$@" "$origin$path" 2>"$work/error"); then
    echo "FAIL $name: $method $path: $(tr '\n' ' ' <"$work/error")"
    failures=$((failures + 1))
    return
  fi
  type=$(tr -d '\r' <"$work/headers" | awk -F': *' 'tolower($1) == "content-type" { type = tolower($2) } END { print type }')
  origin_seen=server
  if grep -qF "$csp_meta_written_by_docs_build" "$work/body"; then
    origin_seen=docs
  fi
  problems=
  if ! printf '%s\n' "$status" | grep -Eqx "$want_status"; then
    problems="$problems; status $status, want $want_status"
  fi
  case $want_type:$type in
    -:* | "$want_type":"$want_type"*) ;;
    *) problems="$problems; content-type '$type', want $want_type" ;;
  esac
  if [ "$origin_seen" != "$want_origin" ]; then
    problems="$problems; answered by $origin_seen, want $want_origin"
  fi
  if [ -z "$problems" ]; then
    echo "ok $name"
  else
    echo "FAIL $name: $method $path: ${problems#; }"
    failures=$((failures + 1))
  fi
}

probe docs-root GET / "$browser" 200 text/html docs
probe docs-root-any-accept GET / '*/*' 200 text/html docs
probe docs-tools GET /tools/ "$browser" 200 text/html docs
probe docs-mcpfoo GET /mcpfoo "$browser" 404 text/html docs
probe docs-mcp-not-a-path GET /mcp-not-a-path "$browser" 404 text/html docs

probe mcp-browser-accept GET /mcp "$browser" 406 application/json server
probe mcp-slash-html-accept GET /mcp/ text/html 406 application/json server
probe mcp-any-accept GET /mcp '*/*' 406 application/json server
probe mcp-no-accept GET /mcp '' 406 application/json server
probe mcp-event-stream GET /mcp text/event-stream 405 application/json server
probe mcp-post POST /mcp "$protocol" 401 application/json server
probe mcp-healthz GET /mcp/healthz '*/*' 200 application/json server
probe carousel-image-1 GET /mcp/carousel/carousel_image_1.png "$browser" 200 image/png server
probe carousel-image-2 GET /mcp/carousel/carousel_image_2.png "$browser" 200 image/png server
probe carousel-image-3 GET /mcp/carousel/carousel_image_3.png "$browser" 200 image/png server

probe healthz GET /healthz '*/*' 200 application/json server
probe oauth-protected-resource GET /.well-known/oauth-protected-resource '*/*' 200 application/json server
probe oauth-protected-resource-mcp GET /.well-known/oauth-protected-resource/mcp '*/*' 200 application/json server
probe oauth-authorization-server GET /.well-known/oauth-authorization-server '*/*' 200 application/json server
probe openai-apps-challenge GET /.well-known/openai-apps-challenge '*/*' 200 text/plain server
probe robots-txt GET /robots.txt '*/*' 200 text/plain server
probe oauth-authorize GET /oauth/authorize '*/*' '30[27]' - server
probe oauth-register GET /oauth/register '*/*' 404 - server
probe oauth-token GET /oauth/token '*/*' 404 - server
probe asset-download GET /assets/download/probe-lesson/probe-type '*/*' 400 application/json server
probe cron-refresh-graph GET /api/cron/refresh-graph '*/*' '401|404' - server
probe favicons GET /favicons/favicon.ico '*/*' 200 image/ server
probe carousel-root GET /carousel/carousel_image_1.png '*/*' 200 image/png server
probe oak-ds GET /oak-ds/styles.css '*/*' 200 text/css server
probe oak-ds-routed GET /mcp/oak-ds/styles.css '*/*' 200 text/css server
probe oak-assets GET /oak-assets/assets/oak-national-academy-logo-512.png '*/*' 200 image/png server

[ "$failures" -eq 0 ]
