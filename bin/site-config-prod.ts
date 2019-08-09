import * as ecs from '@aws-cdk/aws-ecs';
import { ContainerProperties } from '../lib/fargate-docker-stack';

// From where to find and build the docker images
const containerDirectory = './app';

export const dockerProperties: ContainerProperties[] = [
    {
      image: ecs.ContainerImage.fromAsset(containerDirectory),
      containerPort: 80,
      id: 'AppName1',
      pathPattern: '/example*',
      environment: { APP_ENVIRONMENT: `env-AppName1-prod` },
    },
    {
      image: ecs.ContainerImage.fromAsset(containerDirectory),
      containerPort: 80,
      id: 'AppName2',
      pathPattern: '/v2*',
      environment: { APP_ENVIRONMENT: `env-AppName2-prod` },
    },
    {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      containerPort: 80,
      id: 'EcsSample',
      hostHeader: 'site-prod.olmi.be',
      environment: { APP_ENVIRONMENT: `env-EcsSample-dev` },
    },
];

export const stackTags: { name: string, value: string }[] = [
    { name: 'Application', value: 'starter-app' },
    { name: 'CostCenter', value: '10001' }, 
    { name: 'WorkOrder', value: 'APROJECT', }
];
