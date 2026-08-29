# Internal diagnostics deployment

ORES internal diagnostics are a separate control plane for observing failures in
the ORES telemetry data plane. They carry only the closed
`ores.otel.log/internal-diagnostic/v1` schema: operation and outcome enums,
bounded counters, a component identifier, and a canonical timestamp. Never put
application messages, errors, stack traces, URLs, user data, trace data, or
credentials in this channel.

## Backend delivery

The backend library supports CloudWatch Logs, Google Cloud Logging, Azure
Monitor Logs, and structured stderr. It must use ambient workload identity and
an injected cloud SDK call. Do not place static access keys, service-account
keys, client secrets, or cloud logging credentials in a ConfigMap, Secret,
container image, JavaScript bundle, or browser response.

The manifests in this repository are reference overlays. The cluster source of
truth is `github.com/ORESoftware/k8s-cluster`; copy the reviewed configuration
there before production rollout.

Render a target before applying it:

```console
kubectl kustomize overlays/aws
kubectl kustomize overlays/gcp
kubectl kustomize overlays/azure
```

Replace every example account, project, endpoint, DCR, client, and tenant value.
All three overlays retain structured stderr as a fallback so a node-level agent
can collect diagnostics if the application-to-cloud API path is unavailable.
Run the stderr collector outside the ORES deployment and route it directly to
the platform destination.

Use least-privilege identities and pre-provision destinations:

- AWS: grant only `logs:PutLogEvents` for the exact log group and stream. Do not
  grant log-group creation or IAM administration to the application workload.
- GCP: grant `logging.logEntries.create` for the selected project and log.
- Azure: grant the workload permission to use the exact data collection rule and
  stream required by the Logs Ingestion API.

Bound provider SDK timeouts and retries. The application reporter remains
non-throwing and falls back to stderr; the provider sink must not call ORES,
OTLP, or the application's ordinary logger because that would create recursive
telemetry during a failure.

## Browser and edge outage spool

Frontend code never calls a native cloud logging API and never receives cloud
credentials. During an outage it may upload one validated, size-bounded batch
to a single object through a short-lived signed PUT grant:

- AWS S3 `PutObject` presigned URL;
- Google Cloud Storage V4 signed URL;
- Azure Blob Storage user-delegation SAS with blob scope and create/write only.

The grant broker must be independently deployed from the ORES backend, require
the application's normal user or device authentication, enforce per-subject and
per-origin quotas, and issue an unpredictable object key. The existing
Cloudflare health/proxy worker in this repository is not a grant broker and must
not expose an anonymous signing endpoint.

Grants must:

- expire in at most 15 minutes;
- authorize exactly one object and one PUT operation;
- sign `host` and `content-type` for AWS/GCP;
- use `https` on the provider's default port;
- use `application/json` and, for Azure, signed `x-ms-blob-type: BlockBlob`;
- set the library's `maxBytes` to at most the closed batch schema limit;
- avoid list, read, delete, overwrite-by-prefix, container, or account scope.

A signed URL is a bearer capability. Keep it out of application logs, analytics,
error trackers, query relays, referrers, and persistent browser storage. The
client library redacts it and consumes each grant object once, but issuer and
proxy logs need the same redaction policy.

Replace `https://app.example.com` in the provider-specific CORS files under
`outage-spool/` with an exact production origin. Do not use `*`. Permit only PUT
and the signed request headers, expose only `ETag`, and add each exact provider
object host to the application's CSP `connect-src` directive. Test a real browser
preflight as part of the deployment smoke test.

## Cloud-owned validation worker

Object upload is acceptance into an outage spool, not successful delivery to a
logging service. Configure a provider-owned event path that does not depend on
the ORES backend:

- S3 object event to SQS and Lambda;
- Cloud Storage event to Eventarc or Pub/Sub and a worker;
- Azure Blob event to Event Grid or Queue Storage and a Function.

The worker must enforce content length before parsing, reject compression and
unexpected content types, validate the closed batch schema, discard every
unknown field, and reconstruct provider records from accepted primitive values.
Do not rely on the grant's `maxBytes` field as a storage-side limit. Enforce
bucket/container quotas, lifecycle deletion, event retention, concurrency, and
worker parse limits independently.

Use the immutable provider object version plus ETag/generation as the
idempotency key. A safe lifecycle is:

```text
Issued -> Uploaded -> Validated -> Forwarding -> Delivered
                        |              |
                        +-> Rejected   +-> Retry -> Dead-letter
```

Record only this closed lifecycle and bounded counters. Delete or quarantine an
object after terminal processing according to retention policy. Alert on grant
issuance spikes, rejected batches, dead-letter depth, old unprocessed objects,
and stderr fallback activation.

## Rollout checks

1. Run `python3 scripts/validate-internal-diagnostics.py`.
2. Render and policy-scan the selected overlay after replacing placeholders.
3. Send one backend diagnostic and confirm direct provider delivery.
4. Deny the provider API temporarily and confirm structured stderr collection.
5. Stop the ORES backend, request a grant through the independent broker, upload
   from a real browser, and observe the cloud worker deliver the object once.
6. Replay the same object event and confirm idempotent suppression.
7. Try an expired grant, oversized body, wrong origin, wrong content type,
   unsigned header, unknown field, and provider-host substitution; each must fail
   closed without exposing the signed URL.
