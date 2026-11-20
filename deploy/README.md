# Host an agentic website on AWS

`template.yaml` hosts any static agentic website on a private Amazon S3 bucket behind
Amazon CloudFront. It sends the response headers that the Open Agentic Web reference
hosting notes ask for, which some static hosts cannot set:

| Files | Header |
| --- | --- |
| `agent-manifest.json`, `*.network.json`, `links.json`, `agent-mcp.json`, `.well-known/*`, at the root or under any subpath | `Access-Control-Allow-Origin: *` |
| `runtime/sandbox-worker.js` | `Content-Security-Policy: default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'` |
| everything | HTTPS only, `X-Content-Type-Options: nosniff`, HSTS, no `X-Frame-Options` (other sites frame `bridge/action-bridge.html`) |

It also serves `index.html` for folder addresses, so a second agentic site can live under a
subpath, shows the site's `404.html` for missing files, and turns caching off at CloudFront.
The deploy script uploads every file with `Cache-Control: no-cache`, so browsers check
each file before using it. An agentic site's files change together, and a mix of old and
new files breaks it.

## Use it

Needs AWS CLI v2 and credentials that can create S3, CloudFront and CloudFormation
resources.

```shell
AWS_PROFILE=<profile> AWS_REGION=us-east-1 deploy/deploy.sh <stack-name> <site-folder>
```

The script creates or updates the stack, uploads the folder and prints the site's HTTPS
address. Run it again after each change. The first run takes a few minutes while
CloudFront deploys.

`ExtraCorsPath` is one more path pattern served with the CORS header, for files that other
sites import as modules. Agent Crash Test uses it for `harness/*`.

`template.yaml` is written by `make-template.mjs`, because CloudFormation does not accept
YAML anchors and the cache behaviours repeat.

## Cost and removal

A small site costs cents a month: S3 storage plus CloudFront requests. To remove it,
empty the bucket and delete the stack:

```shell
aws s3 rm s3://<bucket> --recursive
aws cloudformation delete-stack --stack-name <stack-name>
```

## Check the headers

```shell
curl -sI -H "Origin: https://example.org" https://<site>/agent-manifest.json | grep -i access-control
curl -sI https://<site>/runtime/sandbox-worker.js | grep -i content-security
```
