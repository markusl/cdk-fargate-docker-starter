import {
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elbv2,
} from 'aws-cdk-lib';
import { ContainerProperties } from '../lib/fargate-docker-stack';

// From where to find and build the docker images
const containerDirectory = './app';

export const dockerProperties: ContainerProperties[] = [
    {
      image: ecs.ContainerImage.fromAsset(containerDirectory),
      containerPort: 80,
      id: 'AppName1',
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/example*'])],
      environment: { APP_ENVIRONMENT: `env-AppName1-prod` },
    },
    {
      image: ecs.ContainerImage.fromAsset(containerDirectory),
      containerPort: 80,
      id: 'AppName2',
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/v2*'])],
      environment: { APP_ENVIRONMENT: `env-AppName2-prod` },
    },
    {
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      containerPort: 80,
      id: 'EcsSample',
      conditions: [
        elbv2.ListenerCondition.hostHeaders(['site-prod.olmi.be'])],
      environment: { APP_ENVIRONMENT: `env-EcsSample-dev` },
    },
];

export const stackTags: { name: string, value: string }[] = [
    { name: 'Application', value: 'starter-app' },
    { name: 'CostCenter', value: '10001' }, 
    { name: 'WorkOrder', value: 'APROJECT', }
];
