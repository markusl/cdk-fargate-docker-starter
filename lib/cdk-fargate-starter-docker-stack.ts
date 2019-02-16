import * as cdk from '@aws-cdk/cdk';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as route53 from '@aws-cdk/aws-route53';
import * as cm from '@aws-cdk/aws-certificatemanager';
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2';

const ssmPolicy = 'arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess';

interface DomainProperties {
  domainName: string;
  subdomainName: string;
  domainCertificateArn: string;
}

interface DockerProperties {
  imageProvider: (scope: cdk.Construct) => ecs.IContainerImage;
  containerPort: number;
  environment?: {
    [key: string]: string;
  }
}

export function createStack(scope: cdk.App,
  id: string,
  dockerProperties: DockerProperties,
  domainProperties: DomainProperties,
  tags: { name: string, value: string }[],
  props?: cdk.StackProps)
{
  const stack = new cdk.Stack(scope, id, props);

  // Create VPC and Fargate Cluster
  // NOTE: Limit AZs to avoid reaching resource quotas
  const vpc = new ec2.VpcNetwork(stack, `${id}Vpc`, { maxAZs: 2 });
  const cluster = new ecs.Cluster(stack, `${id}Cluster`, { vpc });

  tags.forEach((tag) => vpc.apply(new cdk.Tag(tag.name, tag.value)));

  const fgprops: ecs.LoadBalancedFargateServiceProps = {
    cluster,
    image: dockerProperties.imageProvider(stack),
    containerPort: dockerProperties.containerPort,
    environment: dockerProperties.environment,
  };

  const fargateService = new ecs.LoadBalancedFargateService(stack, `${id}FargateService`, fgprops);
  fargateService.service.taskDefinition.taskRole.attachManagedPolicy(ssmPolicy);

  const certificate = cm.Certificate.import(stack, `${id}Certificate`, {
      certificateArn: domainProperties.domainCertificateArn,
  });
  const listenerProps = {
    port: 443,
    defaultTargetGroups: [fargateService.targetGroup],
    certificateArns: [certificate.certificateArn],
  };
  const loadBalancer = fargateService.loadBalancer as elb.ApplicationLoadBalancer;
  loadBalancer.addListener('HttpsListener', listenerProps);

  const zone = new route53.HostedZoneProvider(stack, {
    domainName: domainProperties.domainName
  }).findAndImport(stack, `${id}Zone`);

  // tslint:disable-next-line:no-unused-expression
  new route53.CnameRecord(stack, `${id}Site`, {
    zone,
    recordName: domainProperties.subdomainName,
    recordValue: fargateService.loadBalancer.dnsName,
  });

  // Output the DNS where you can access your service
  // tslint:disable-next-line:no-unused-expression
  new cdk.Output(stack, `${id}DNS`, { value: fargateService.loadBalancer.dnsName });
  return stack;
}
