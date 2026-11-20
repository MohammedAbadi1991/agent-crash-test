#!/usr/bin/env bash
# Create or update the hosting stack and upload a site folder.
#   deploy/deploy.sh [stack-name] [site-folder]
# Needs AWS CLI v2 with credentials (AWS_PROFILE) and a region (AWS_REGION, default us-east-1).
set -euo pipefail
cd "$(dirname "$0")/.."
STACK="${1:-agent-crash-test}"
SITE="${2:-site}"
REGION="${AWS_REGION:-us-east-1}"

aws cloudformation deploy --region "$REGION" --stack-name "$STACK" \
  --template-file deploy/template.yaml --no-fail-on-empty-changeset

output() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET="$(output BucketName)"

# Network sources and notes stay in the repository; the site serves the built files.
aws s3 sync "$SITE" "s3://$BUCKET" --region "$REGION" --delete \
  --exclude "*.hocon" --exclude "*.md" --only-show-errors
# The AWS CLI does not know .mjs, and a browser refuses a module without a JavaScript type.
aws s3 cp "$SITE" "s3://$BUCKET" --region "$REGION" --recursive \
  --exclude "*" --include "*.mjs" --content-type "text/javascript; charset=utf-8" --only-show-errors

echo "Site: $(output SiteUrl)"
