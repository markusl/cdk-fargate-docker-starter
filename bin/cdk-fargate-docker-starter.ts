#!/usr/bin/env node
import * as cdk from '@aws-cdk/cdk';
import * as ecs from '@aws-cdk/aws-ecs';
import { createStack } from '../lib/cdk-fargate-starter-docker-stack';

// Name for the app and prefix for all created resources
const appName = 'AppName';

// Define region and acconunt for the stack
const stackProperties = {
    env: {
        region: 'eu-west-1',
        account: '872821666058',
    }
};

const certificateIdentifier = '797eea2c-26c3-416d-9a24-2f093998383f';

// Use predefined hosted zone and a domain certificate
const dnsProperties = {
    domainName: 'olmi.be',
    subdomainName: 'site',
    domainCertificateArn: `arn:aws:acm:${stackProperties.env.region}:${stackProperties.env.account}:certificate/${certificateIdentifier}`,
};

const tags: { name: string, value: string }[] = [
    { name: 'Application', value: 'starter-app' },
    { name: 'CostCenter', value: '10001' }, 
    { name: 'WorkOrder', value: 'APROJECT', }
];

// From where to build the docker image
const containerDirectory = './app';

// Define some environment properties for the image
const environment = { APP_ENVIRONMENT: 'test' };

const app = new cdk.App();

// Callback that will provide the correct image to the cluster
const imageProvider = (scope: cdk.Construct) =>
    ecs.ContainerImage.fromAsset(scope, `${appName}Image`, { directory: containerDirectory });
    // alternatively use container image directly from docker hub
    // ecs.ContainerImage.fromDockerHub('amazon/amazon-ecs-sample');

const dockerProperties =  { imageProvider, containerPort: 80, environment };
createStack(app, appName, dockerProperties, dnsProperties, tags, stackProperties);
app.run();
