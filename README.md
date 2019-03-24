# CDK Fargat Docker starter kit

This repository shows an example of how to deploy a simple docker image to a Fargate cluster using AWS CDK.

Read more of CDK at <https://docs.aws.amazon.com/CDK/latest/userguide/what-is.html>

Features:

* Fargate cluster with multiple availability zones
* Nginx server serving static site (just an example of a docker image)
* Running multiple containers on different context paths
* Pass environment parameters to the container
* Configure a domain namem certificate and a HTTPS listener for the service
* Creates ALB redirect from HTTP to the HTTPS endpoint
* Resource tagging

## Configure required AWS account

Check that your AWS account is configured. Assume the role in the shell:

```bash
# Install from https://github.com/remind101/assume-role
eval $(assume-role your-aws-role)
```

## Initial setup

First you need to have AWS CDK installed and bootstrap the project on wanted account.

```bash
# Install or update CDK globally
npm i -g aws-cdk
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
