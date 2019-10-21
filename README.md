# CDK Fargate Docker starter kit

This repository shows an example of how to deploy a simple docker image to a Fargate cluster using AWS CDK.

Read more of CDK at <https://docs.aws.amazon.com/CDK/latest/userguide/what-is.html>

Features:

* Fargate cluster with multiple availability zones
* Nginx server serving static site (just an example of a docker image)
* Running multiple containers on different context paths
* Host header or path pattern matching for routing
* Fixed response for unrouted requests
* Pass environment variables/parameters to containers
* Configure a domain name with a TLS certificate and a HTTPS listener for the service
* Application load balancer (ALB) redirect from HTTP to the HTTPS endpoint
* Logging
* Resource tagging

## Configure required AWS account

Check that your AWS account is configured. Assume the role in the shell:

```bash
# Install from https://github.com/remind101/assume-role
eval $(assume-role your-aws-role)
```

## Initial setup

First you need to have the needed build tools and the AWS CDK installed.
After everything is installed you can bootstrap the project on wanted account.

* Install Node <https://nodejs.org>
* Install Docker <https://www.docker.com/get-started>

### Install dependencies

```bash
brew install node awscli
# Install or update CDK globally
npm i -g aws-cdk
```

### Bootstrap the project on a selected account

```bash
# Initial build
npm run build
# Initialize the environment
cdk bootstrap aws://account-id/region
```

### Domain and certificate setup

1. Create a hosted zone (domain name) in AWS Route 53.
2. Use AWS Certificate Manager to create a domain certificate for dev and prod domains.

Take a note of the certificated ARN's that are needed for the deployment.

## Initial deployment

Check that the stack builds.

```bash
npm run build
```

Bootstrap the account.

```bash
cdk bootstrap aws://<account>/eu-west-1 -c certificateIdentifier=e3da8de9-ec36-4c75-addd-cc62701eac3a -c domainName=olmi.be -c subdomainName=site-dev -c environment=dev
```

Deploy the dev version

```bash
cdk deploy -c certificateIdentifier=e3da8de9-ec36-4c75-addd-cc62701eac3a -c domainName=olmi.be -c subdomainName=site-dev -c environment=dev
```

Change the parameters to deploy a prod version:

```bash
cdk deploy -c certificateIdentifier=2ff0d9f4-98be-477a-a29f-86d871d5e31f -c domainName=olmi.be -c subdomainName=site-prod -c environment=prod
```

## Other commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
