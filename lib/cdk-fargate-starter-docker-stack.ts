import * as cdk from '@aws-cdk/cdk';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as route53 from '@aws-cdk/aws-route53';
import * as cm from '@aws-cdk/aws-certificatemanager';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
// tslint:disable:no-unused-expression

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
  imageProvider: (scope: cdk.Construct, id: string) => ecs.ContainerImage;
  containerPort: number;
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
      image: dockerProperties.imageProvider(stack, `${id}Image`),
      memoryLimitMiB: 256,
      environment: { APP_ENVIRONMENT: `env-${id}` },
    })
    .addPortMappings({
      containerPort: dockerProperties.containerPort,
      protocol: ecs.Protocol.Tcp,
    });
  return taskDefinition;
};

const configureClusterAndServices = (
  id: string,
  stack: cdk.Stack,
  certificate: cm.ICertificate,
  dockerProperties: DockerProperties) => {

  // NOTE: Limit AZs to avoid reaching resource quotas
  const vpc = new ec2.VpcNetwork(stack, `${id}Vpc`, { maxAZs: 2 });
  const cluster = new ecs.Cluster(stack, `${id}Cluster`, { vpc });

  const fargateService1 = new ecs.FargateService(stack, `${id}FargateService-1`, {
    cluster,
    taskDefinition: createTaskDefinition(`${id}-1`, stack, dockerProperties),
  });

  const fargateService2 = new ecs.FargateService(stack, `${id}FargateService-2`, {
    cluster,
    taskDefinition: createTaskDefinition(`${id}-2`, stack, dockerProperties),
  });

  const loadBalancer = new elbv2.ApplicationLoadBalancer(stack, `${id}LoadBalancer`, {
    vpc,
    internetFacing: true,
  });
  createHttpsRedirect(id, stack, loadBalancer);

  const listener = loadBalancer.addListener(`${id}HttpsListener`, {
      port: 443,
      certificateArns: [certificate.certificateArn],
    });
  // Configure path /v2 to route to the second service
  listener.addTargets(`${id}HttpTarget-2`, {
      protocol: elbv2.ApplicationProtocol.Http,
      port: dockerProperties.containerPort,
      targets: [fargateService2],
      pathPattern: '/v2*',
      priority: 20,
    });
  listener.addTargets(`${id}HttpTarget-1`, {
      protocol: elbv2.ApplicationProtocol.Http,
      port: dockerProperties.containerPort,
      targets: [fargateService1],
    });
  return { vpc, fargateService1, fargateService2, loadBalancer };
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
  const { vpc, fargateService1, fargateService2, loadBalancer } = configureClusterAndServices(id, stack, certificate, dockerProperties);
  tags.forEach((tag) => vpc.node.apply(new cdk.Tag(tag.name, tag.value)));
  tags.forEach((tag) => loadBalancer.node.apply(new cdk.Tag(tag.name, tag.value)));
  tags.forEach((tag) => fargateService1.node.apply(new cdk.Tag(tag.name, tag.value)));
  tags.forEach((tag) => fargateService2.node.apply(new cdk.Tag(tag.name, tag.value)));

  const zone = new route53.HostedZoneProvider(stack, {
    domainName: domainProperties.domainName
  }).findAndImport(stack, `${id}Zone`);

  new route53.CnameRecord(stack, `${id}Site`, {
    zone,
    recordName: domainProperties.subdomainName,
    recordValue: loadBalancer.dnsName,
  });

  // Output the DNS name where you can access your service
  new cdk.CfnOutput(stack, `${id}DNS`, { value: loadBalancer.dnsName });
  return stack;
}
