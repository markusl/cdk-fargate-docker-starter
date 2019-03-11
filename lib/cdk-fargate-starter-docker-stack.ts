import * as cdk from '@aws-cdk/cdk';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as route53 from '@aws-cdk/aws-route53';
import * as cm from '@aws-cdk/aws-certificatemanager';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';

const ssmPolicy = 'arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess';

interface Tag {
  name: string;
  value: string;
}

interface DomainProperties {
  domainName: string;
  subdomainName: string;
  domainCertificateArn: string;
}

interface DockerProperties {
  imageProvider: (scope: cdk.Construct) => ecs.ContainerImage;
  containerPort: number;
  environment?: {
    [key: string]: string;
  }
}

/// Creates ALB redirect from port 80 to the HTTPS endpoint
const createHttpsRedirect = (id: string, scope: cdk.Construct, loadBalancer: elbv2.ApplicationLoadBalancer) => {
  const port = 80;
  loadBalancer.connections.allowFromAnyIPv4(new ec2.TcpPort(port));
  const actionProperty: elbv2.CfnListener.ActionProperty = {
    type: 'redirect',
    redirectConfig: {
      statusCode: 'HTTP_302',
      protocol: 'HTTPS',
      port: '443',
    },
  };
  const redirectProps: elbv2.CfnListenerProps = {
    defaultActions: [actionProperty],
    loadBalancerArn: loadBalancer.loadBalancerArn,
    port,
    protocol: 'HTTP',
  };
  return new elbv2.CfnListener(scope, `${id}HttpRedirect`, redirectProps);
};

const createTaskDefinition = (id: string, stack: cdk.Stack, dockerProperties: DockerProperties) => {
  const taskDefinition = new ecs.FargateTaskDefinition(stack, `${id}TaskDefinition`);
  taskDefinition.taskRole.attachManagedPolicy(ssmPolicy);
  taskDefinition
    .addContainer(`${id}Container`, {
      image: dockerProperties.imageProvider(stack),
      memoryLimitMiB: 256,
      environment: dockerProperties.environment,
    })
    .addPortMappings({
      containerPort: dockerProperties.containerPort,
      protocol: ecs.Protocol.Tcp,
    });
  return taskDefinition;
};

const configureClusterAndLoadBalancer = (
  id: string,
  stack: cdk.Stack,
  certificate: cm.ICertificate,
  dockerProperties: DockerProperties) => {

  // NOTE: Limit AZs to avoid reaching resource quotas
  const vpc = new ec2.VpcNetwork(stack, `${id}Vpc`, { maxAZs: 2 });
  const cluster = new ecs.Cluster(stack, `${id}Cluster`, { vpc });

  const fargateService = new ecs.FargateService(stack, `${id}FargateService`, {
    cluster,
    taskDefinition: createTaskDefinition(id, stack, dockerProperties),
  });

  const loadBalancer = new elbv2.ApplicationLoadBalancer(stack, `${id}LoadBalancer`, {
    vpc,
    internetFacing: true,
  });
  createHttpsRedirect(id, stack, loadBalancer);
  loadBalancer
    .addListener(`${id}HttpsListener`, {
      port: 443,
      certificateArns: [certificate.certificateArn],
    })
    .addTargets(`${id}HttpTarget`, {
      protocol: elbv2.ApplicationProtocol.Http,
      port: dockerProperties.containerPort,
      targets: [fargateService],
    });
  return { vpc, fargateService, loadBalancer };
};

export function createStack(scope: cdk.App,
  id: string,
  dockerProperties: DockerProperties,
  domainProperties: DomainProperties,
  tags: Tag[],
  props?: cdk.StackProps)
{
  const stack = new cdk.Stack(scope, id, props);

  const certificate = cm.Certificate.import(stack, `${id}Certificate`, {
    certificateArn: domainProperties.domainCertificateArn,
  });
  const { vpc, fargateService, loadBalancer } = configureClusterAndLoadBalancer(id, stack, certificate, dockerProperties);
  tags.forEach((tag) => vpc.node.apply(new cdk.Tag(tag.name, tag.value)));
  tags.forEach((tag) => loadBalancer.node.apply(new cdk.Tag(tag.name, tag.value)));
  tags.forEach((tag) => fargateService.node.apply(new cdk.Tag(tag.name, tag.value)));

  const zone = new route53.HostedZoneProvider(stack, {
    domainName: domainProperties.domainName
  }).findAndImport(stack, `${id}Zone`);

  // tslint:disable-next-line:no-unused-expression
  new route53.CnameRecord(stack, `${id}Site`, {
    zone,
    recordName: domainProperties.subdomainName,
    recordValue: loadBalancer.dnsName,
  });

  // Output the DNS where you can access your service
  // tslint:disable-next-line:no-unused-expression
  new cdk.Output(stack, `${id}DNS`, { value: loadBalancer.dnsName });
  return stack;
}
