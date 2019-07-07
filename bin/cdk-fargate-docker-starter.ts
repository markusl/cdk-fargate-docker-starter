#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import * as ecs from '@aws-cdk/aws-ecs';
import { createStack, ContainerProperties } from '../lib/fargate-docker-stack';

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

const app = new cdk.App();

const dockerProperties: ContainerProperties[] = [
  {
    image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
    containerPort: 80,
    id: 'EcsSample',
    hostHeader: 'site.olmi.be',
    environment: { APP_ENVIRONMENT: `env-EcsSample` },
  },
  {
    image: ecs.ContainerImage.fromAsset(containerDirectory),
    containerPort: 80,
    id: 'AppName1',
    pathPattern: '/example*',
    environment: { APP_ENVIRONMENT: `env-AppName1` },
  },
  {
    image: ecs.ContainerImage.fromAsset(containerDirectory),
    containerPort: 80,
    id: 'AppName2',
    pathPattern: '/v2*',
    environment: { APP_ENVIRONMENT: `env-AppName2` },
  },
];
createStack(app, appName, dockerProperties, dnsProperties, tags, stackProperties);
app.synth();
