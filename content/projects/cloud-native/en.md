## The service and the question {#overview}

The application is a REST API for users, products, product images and email verification. The interesting part is everything around it: how a change gets from a pull request onto running machines, and what each running piece is allowed to touch.

- **Compute.** Spring Boot runs on a machine image built by Packer, in an Auto Scaling group of three to five instances in private subnets across {{fact:azs}} Availability Zones, behind an HTTPS Application Load Balancer and a Route 53 alias.
- **Data.** RDS MySQL with Flyway migrations and Hibernate set to validate the schema; S3 for product images.
- **Email.** Sign-ups publish to SNS; a Lambda function sends the verification email.
- **Two AWS accounts.** Images are built in a dev account and promoted to a demo account.

Terraform defines all of it except the SNS topic and the TLS certificate, which were set up by hand.

## What the course set, and what I did {#ownership}

This was individual coursework in nine assignments. The assignments set the milestones and much of what had to be built, so I don't present the order of work as a product roadmap I invented. Within them, all of the implementation is mine: the API, the Terraform, the Packer template, the workflows and the Lambda function. Every commit and pull request in the three repositories is mine; the repositories recorded {{fact:ci_runs}} CI runs over the course.

Where this page says "chosen", it describes what the code does and what that costs — not a claim that the course left every option open.

## From a merged pull request to running instances {#delivery}

No one logs in to a server to release. A release is a new machine image, and the Auto Scaling group replaces its instances with it.

1. **On every pull request,** one workflow runs the test suite on JDK 21 against a MySQL service container; another checks the Packer template with `fmt`, `init` and `validate`. These checks are the gate: the merge build does not run the tests again.
2. **On merge, in the dev account,** the workflow builds the jar and Packer bakes an image with the jar, a systemd service, a time-sync fix and the CloudWatch agent. The image is shared with the demo account, and the Packer manifest passes its ID to the next job.
3. **In the demo account,** the workflow creates a new launch-template version with that image and makes it the default.
4. **Instance refresh.** It then starts an instance refresh that keeps at least half of the capacity healthy, may run up to one and a half times the capacity during the swap, and gives each new instance a three-minute warm-up.
5. **Health checks decide.** The group uses the load balancer's health check on `/actuator/health`, with a ten-minute grace period for new instances. The workflow polls until the refresh completes; a refresh whose new instances never become healthy does not complete successfully.
6. **At boot,** user data fetches the database password from Secrets Manager into an environment file with restricted permissions and starts the CloudWatch agent, so no secret is baked into the image.

A successful run took {{fact:deploy_median}} at the median, from image build to a finished refresh. There is no earlier baseline, so that is a duration, not an improvement.

**What makes this weaker than it looks.** The health check accepts any status from `200` to `499` as healthy, so an instance that answers every request with a client error would still pass. The merge build skips the tests, so a change that bypasses the pull-request check would ship untested.

## Who can reach what {#boundaries}

The second design question is the runtime boundary: which component may talk to which, and with what permissions.

- **Network.** Each Availability Zone has a public and a private subnet. Only the load balancer is public. Instances have no public IP addresses and reach the internet through one NAT gateway. The SSH rule and the plain-HTTP listener were removed during development.
- **Security groups by reference.** Groups reference each other instead of IP ranges: the load balancer accepts web traffic, the instances accept the application port only from the load balancer, and the database accepts MySQL only from the instances and the Lambda function.
- **Scoped roles.** The instance role can reach one bucket, the four keys it needs, one secret and one SNS topic. The Lambda role can read its two secrets and keys. Logging and metrics permissions still use wildcards, and the key policies give the instance role administrative actions it does not need — so I describe these roles as scoped, not as least privilege.
- **Keys and secrets.** {{fact:kms_keys}} customer-managed KMS keys, one each for S3, the instance disks, RDS and Secrets Manager, rotated automatically. Terraform generates the database password and stores it in Secrets Manager.
- **Availability versus cost.** The application tier spans three zones, but the database and the NAT gateway are single-AZ. An outage in either zone takes the service down; in exchange, the fixed monthly cost stays low for coursework.

## Assignment milestones {#planning}

The history reads like a sequence of milestones, each landed through pull requests: an API with tests first, then CI, then images and infrastructure as code, then the data tier, observability, load balancing, and finally events, keys and serverless email.

## Observability {#observability}

Two aspect-oriented interceptors measure every controller call (count by status, and timing) and every repository call (successes, errors and timing). Micrometer sends the metrics to the CloudWatch agent through StatsD, and the application writes structured JSON logs that the agent ships to CloudWatch Logs. CPU alarms drive one-step scale-out and scale-in policies. There is no dashboard and no alarm notification; the metrics are there to be graphed, but I did not build one.

## Email verification off the request path {#email}

When a user signs up, the API publishes an event to SNS and returns. A Lambda function in the VPC (Python) receives the event and sends the verification link through Mailgun; the link carries a single-use token that expires quickly. The function has its own CI workflow that publishes a new version to the dev account and then to the demo account.

## Gaps and next steps {#limits}

- **Never load-tested.** The scaling policies exist, but no load test ever exercised them, so I make no claim about how the service scales.
- **A permissive health check** and **tests skipped on merge** (see above). Both are one-line fixes: a `200` matcher and running the tests in the merge build.
- **Flat Terraform.** One root module with local state, applied by hand. Next: reusable modules and remote state with locking.
- **Long-lived CI keys.** The workflows use access keys stored as secrets. I would switch to GitHub's OIDC federation, as I later did in the KK Knock pipeline.
- **Thin test suite.** Three REST Assured classes cover a positive flow, a negative flow and edge cases, including a burst of concurrent requests. There are no unit tests and no coverage report.
- **IAM breadth.** Tighten the wildcard logging permissions and the KMS key policies.
