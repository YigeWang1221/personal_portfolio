## The system {#overview}

The application is a REST API for users, products, product images and email verification. The interesting part is everything around it:

- **Compute.** Spring Boot runs on a machine image built by Packer, in an Auto Scaling group of three to five instances in private subnets across {{fact:azs}} Availability Zones. An HTTPS Application Load Balancer and a Route 53 alias sit in front.
- **Data.** RDS MySQL for records, with Flyway migrations and Hibernate set to validate the schema; S3 for product images, with objects moving to Standard-IA after thirty days.
- **Keys and secrets.** {{fact:kms_keys}} customer-managed KMS keys and a database password that Terraform generates and stores in Secrets Manager.
- **Email.** Sign-ups publish to SNS; a Lambda function sends the verification email through Mailgun.
- **Two AWS accounts.** Images are built in a dev account and promoted to a demo account.

Terraform defines all of it except the SNS topic and the TLS certificate, which were set up by hand.

## How it was delivered {#planning}

The course was structured as nine assignments, and I treated each one as a milestone with its own pull requests. The history reads like a roadmap: an API with tests first, then CI, then images and infrastructure as code, then the data tier, observability, load balancing, and finally events, keys and serverless email. Every step landed through pull requests.

## Key decisions {#decisions}

| Decision | Chosen | Trade-off |
|---|---|---|
| Release model | Immutable AMIs rolled out by instance refresh | Slower than updating servers in place; every release is reproducible and easy to roll back |
| Environments | Separate dev and demo AWS accounts, with the AMI shared across | More IAM wiring; a mistake in dev cannot touch demo |
| Availability versus cost | Application tier across three AZs; single-AZ RDS; one NAT gateway | An outage of the NAT gateway's or the database's zone takes the service down; much lower fixed cost |
| Secrets | Secrets Manager with KMS; the database password is fetched at boot | Boot depends on AWS APIs; no database password is baked into an image |
| Email | SNS → Lambda → Mailgun, instead of sending from the request | A third-party dependency; sign-up latency does not depend on email delivery |

## What I owned {#ownership}

All of it. It was individual coursework: I wrote the API, the Terraform, the Packer templates, the workflows and the Lambda function, and every commit and pull request in the three repositories is mine. The repositories recorded {{fact:ci_runs}} CI runs over the course.

## Immutable releases across accounts {#pipeline}

- **On every pull request,** one workflow runs the test suite on JDK 21 against a MySQL service container, and another checks the Packer template with `fmt`, `init` and `validate`.
- **On merge,** the pipeline builds the jar and bakes an AMI in the dev account with Packer, then shares it with the demo account. The Packer manifest passes the new AMI ID to the next job.
- **In the demo account,** it creates a new launch-template version, makes it the default, starts an instance refresh that keeps enough healthy capacity during the swap, and waits until the refresh completes.

A successful deploy took {{fact:deploy_median}} at the median. There is no "before" measurement, so I report the duration itself rather than a percentage improvement.

One honest detail: tests run on the pull request, and the merge build skips them to save time. The pull-request check is the gate.

## Security design {#security}

- **One KMS key per service** — S3, the instance disks, RDS and Secrets Manager — each rotated automatically.
- **No passwords in images.** Terraform generates the database password and stores it in Secrets Manager. At boot, user data fetches it into a local environment file with restricted permissions.
- **Network boundaries by reference.** Security groups reference each other instead of CIDR ranges: the load balancer faces the internet, the instances accept traffic only from the load balancer on the application port, and the database only from the instances and the Lambda.
- **Scoped roles per component.** The instance role can reach only its bucket, its keys, one secret and one SNS topic. Logging and metrics permissions still use wildcards, and the key policies are broader than they need to be — see the last section.
- **No SSH.** Instances have no public IP addresses; the SSH rule and the plain-HTTP listener were removed during development.

## Observability {#observability}

Two aspect-oriented interceptors measure every controller call (count by status, and timing) and every repository call (successes, errors and timing). Micrometer sends the metrics to the CloudWatch agent through StatsD, and the application writes structured JSON logs that the agent ships to CloudWatch Logs. CPU alarms drive one-step scale-out and scale-in policies. There is no dashboard; the metrics are there to be graphed, but I did not build one.

## Email verification off the request path {#email}

When a user signs up, the API publishes an event to SNS and returns. A Lambda function in the VPC (Python) receives the event and sends the verification link through Mailgun; the link carries a single-use token that expires quickly. The function has its own CI workflow that publishes a new version to the dev account and then to the demo account.

## Trade-offs, gaps and next steps {#limits}

- **Deliberate single points of failure.** One NAT gateway and a single-AZ database keep the monthly cost low for coursework; a production version would spread both across zones.
- **Flat Terraform.** The configuration is one root module with local state. Next steps: reusable modules and remote state with locking.
- **Long-lived CI keys.** The workflows use access keys stored as secrets. I would switch to GitHub's OIDC federation, as I later did in the KK Knock pipeline.
- **Thin test suite.** Three REST Assured classes cover a positive flow, a negative flow and edge cases, including a burst of concurrent requests. There are no unit tests and no coverage report.
- **IAM breadth.** Logging and metrics permissions use wildcards, and the KMS key policies grant the instance role more than it needs. Both should be tightened.
- **Measure before claiming.** Deploy time and cost were never measured against a baseline, so this page reports only what the history shows.
