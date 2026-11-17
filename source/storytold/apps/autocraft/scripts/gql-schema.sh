#!/bin/sh
# Refreshes GitHub's public GraphQL schema used by the query tests.
set -eu
cd "$(dirname "$0")/.."
curl -sSfL https://docs.github.com/public/fpt/schema.docs.graphql -o test/fixtures/github-schema.graphql
