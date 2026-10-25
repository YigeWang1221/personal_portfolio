## Backend and AWS infrastructure {#overview}

I built a Spring Boot service for users, products and images, and connected it to AWS compute, storage and email services. Terraform provisions the network and application resources; GitHub Actions and Packer turn each release into a machine image.

The application runs behind an HTTPS Application Load Balancer in private subnets across {{fact:azs}} Availability Zones. RDS MySQL stores application data, Flyway manages schema changes, and S3 stores product images. I configured Route 53 application and email records, the TLS listener, component IAM roles, KMS encryption and Secrets Manager access.

Registration publishes an SNS event. A Lambda function sends the verification email through Mailgun, keeping email delivery outside the registration request.

## Image-based releases across AWS accounts {#delivery}

I designed the release pipeline around a versioned machine image. GitHub Actions builds the application in the dev account, and Packer packages it with its systemd service and CloudWatch agent. The workflow shares the image with the demo account, creates a launch-template version and starts an Auto Scaling instance refresh.

This makes the image and launch-template version the release unit. Instances start from the same artifact, and a previous version can be selected for rollback. The pipeline trades image-build time for a repeatable deployment path; the median successful build-to-refresh duration was {{fact:deploy_median}}.

At startup, each instance retrieves its database password from Secrets Manager and starts the application and monitoring agent. The image contains the application and runtime configuration, while the secret is supplied at boot.

## Network and component permissions {#boundaries}

I divided the VPC into public and private subnets. The load balancer receives public traffic; application instances use private addresses, reach external services through a NAT gateway and connect to RDS through security-group references.

Component roles define access to S3, KMS, Secrets Manager and SNS. Terraform creates {{fact:kms_keys}} customer-managed KMS keys for object storage, instance disks, the database and secrets, and generates the database password into Secrets Manager.

The application tier spans multiple Availability Zones. The database and NAT gateway use a single zone, reflecting the project's infrastructure cost choice.

## Application data and schema management {#validation}

The API separates user, product and image operations. MySQL holds the structured records, while S3 holds image objects. Flyway applies database migrations and Hibernate validates the resulting schema when the service starts.

## AOP metrics and application monitoring {#observability}

I used Spring AOP to implement monitoring aspects for the controller and repository layers, keeping instrumentation separate from business logic. The controller aspect records request counts by HTTP status and execution time; the repository aspect records database operation successes, errors and duration.

Micrometer sends metrics through StatsD to the CloudWatch agent, while structured JSON logs go to CloudWatch Logs for API and database diagnostics. CloudWatch CPU alarms trigger the infrastructure’s Auto Scaling policies.

## Asynchronous email verification {#email}

I designed and implemented an asynchronous verification flow using SNS, Lambda and Mailgun. After registration, the backend publishes a verification event to SNS. A Python Lambda function sends the verification link with a short-lived, single-use token, keeping email delivery out of the registration request.

The Lambda function runs inside the VPC and has a dedicated GitHub Actions workflow that releases to the dev account and then the demo account.

## Connecting application and infrastructure design {#planning}

I connected the API's runtime needs to the infrastructure: database access determines security-group rules and secret retrieval; image storage determines S3 permissions; registration events determine the SNS and Lambda integration. The release workflow then packages these requirements into the image and startup configuration.
