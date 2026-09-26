## The service {#overview}

The application is a REST API for users, products, product images and email verification. The interesting part is everything around it: how a change gets from a pull request onto running machines, what each running piece is allowed to touch, and how the platform is described as code.

- **Compute.** Spring Boot runs on a machine image built by Packer, in an Auto Scaling group of three to five instances in private subnets across {{fact:azs}} Availability Zones, behind an HTTPS Application Load Balancer and a Route 53 alias.
- **Data.** RDS MySQL with Flyway migrations and Hibernate set to validate the schema; S3 for product images.
- **Email.** Sign-ups publish to SNS; a Lambda function sends the verification email.
- **Two AWS accounts.** Images are built in a dev account and promoted to a demo account.

Terraform defines all of it except the SNS topic and the TLS certificate, which were set up by hand. The course set the nine milestones; the design of each piece is described below as the code implements it.

## From a merged pull request to running instances {#delivery}

A release is a new machine image, and the Auto Scaling group replaces its instances with it. No one logs in to a server, and nothing is patched in place.

1. **Check.** On every pull request, one workflow runs the test suite on JDK 21 against a MySQL service container, and another checks the Packer template with `fmt`, `init` and `validate`. These checks are the gate: the merge build does not run the tests again.
2. **Build.** On merge, in the dev account, the workflow builds the jar and Packer bakes an image with the jar, a systemd service, a time-sync fix and the CloudWatch agent. The Packer manifest passes the image ID to the next job.
3. **Promote.** The image is shared with the demo account, where the workflow creates a new launch-template version with it and makes that version the default.
4. **Roll out.** An instance refresh then replaces the instances while keeping at least half of the capacity in service, running up to one and a half times the capacity during the swap, and giving each new instance a three-minute warm-up. The workflow polls until the refresh finishes.
5. **Boot.** User data fetches the database password from Secrets Manager into an environment file with restricted permissions and starts the CloudWatch agent, so no secret is baked into the image.

**What the health check guarantees.** The group relies on the load balancer's health check on `/actuator/health`, with a ten-minute grace period for new instances. The check counts any HTTP status from `200` to `499` as healthy. It therefore catches an instance that does not answer or answers with a server error — Spring's health endpoint returns `503` when it is down — but an instance that answers every request with a client error would still pass. Narrowing the matcher to `200` is a one-line change.

A successful run took {{fact:deploy_median}} at the median, from image build to a finished refresh.

**Why a new image per release.** Updating instances in place would be faster. Baking an image makes every release reproducible and easy to roll back — the previous launch-template version still exists — and keeps the dev account's mistakes out of the demo account. The cost is the image build on every merge.

## Who can reach what {#boundaries}

The second design question is the runtime boundary: which component may talk to which, and with what permissions.

- **Network.** Each Availability Zone has a public and a private subnet. Only the load balancer is public. Instances have no public IP addresses and reach the internet through one NAT gateway. The SSH rule and the plain-HTTP listener were removed during development.
- **Security groups by reference.** Groups reference each other instead of IP ranges: the load balancer accepts web traffic, the instances accept the application port only from the load balancer, and the database accepts MySQL only from the instances and the Lambda function.
- **Scoped roles.** The instance role can reach one bucket, the four keys it needs, one secret and one SNS topic; the Lambda role can read its two secrets and keys. Logging and metrics permissions still use wildcards, and the key policies give the instance role administrative actions it does not need, so these roles are scoped rather than least-privilege.
- **Keys and secrets.** {{fact:kms_keys}} customer-managed KMS keys, one each for S3, the instance disks, RDS and Secrets Manager, rotated automatically. Terraform generates the database password and stores it in Secrets Manager.
- **Availability versus cost.** The application tier spans three zones, but the database and the NAT gateway are single-AZ. An outage in either zone takes the service down; in exchange, the fixed monthly cost stays low for coursework.

## What ran, and what is still weak {#validation}

- **Ran.** The platform was deployed and released repeatedly during the course, through the pipeline above; the three repositories recorded {{fact:ci_runs}} CI runs. Whether any environment still runs today is unknown.
- **Never load-tested.** The scaling policies exist, but no load test exercised them, so I make no claim about how the service scales.
- **Tests only on pull requests.** A change that bypassed the pull-request check would ship untested. Running the tests in the merge build fixes it.
- **Thin test suite.** Three REST Assured classes cover a positive flow, a negative flow and edge cases, including a burst of concurrent requests. There are no unit tests and no coverage report.
- **Flat Terraform.** One root module with local state, applied by hand. Next: reusable modules and remote state with locking.
- **Long-lived CI keys.** The workflows use access keys stored as secrets. I would switch to GitHub's OIDC federation, as I later did in the KK Knock pipeline.

## Observability {#observability}

Two aspect-oriented interceptors measure every controller call (count by status, and timing) and every repository call (successes, errors and timing). Micrometer sends the metrics to the CloudWatch agent through StatsD, and the application writes structured JSON logs that the agent ships to CloudWatch Logs. CPU alarms drive one-step scale-out and scale-in policies. There is no dashboard and no alarm notification yet.

## Email verification off the request path {#email}

When a user signs up, the API publishes an event to SNS and returns. A Lambda function in the VPC (Python) receives the event and sends the verification link through Mailgun; the link carries a single-use token that expires quickly. The function has its own CI workflow that publishes a new version to the dev account and then to the demo account.

## Assignment milestones {#planning}

The history reads as a sequence of milestones, each landed through pull requests: an API with tests first, then CI, then images and infrastructure as code, then the data tier, observability, load balancing, and finally events, keys and serverless email.
