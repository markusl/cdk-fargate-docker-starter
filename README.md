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
cdk bootstrap account-id/region
```

### Domain and certificate setup

1. Create a hosted zone (domain name) in AWS Route 53.
2. Use AWS Certificate Manager to create a domain certificate

Take a note of the certificated id which is configured in `bin/cdk-fargate-docker-starter.ts`.

## Incremental deployments

After you have made your changes to the stack, run.

```bash
npm run build && cdk deploy
```

## Other commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
