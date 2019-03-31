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

// Definitions for a single service
export interface ContainerProperties {
  imageProvider: (scope: cdk.Construct) => ecs.ContainerImage;
  // The container port
  containerPort: number;
  // Unique id of the service
  id: string;
  // Environment variables for the container
  environment: { [key: string]: string; };
  // Define the path or leave empty for default target
  pathPattern?: string;
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

const createTaskDefinition = (id: string, stack: cdk.Stack, containerProperties: ContainerProperties) => {
  const taskDefinition = new ecs.FargateTaskDefinition(stack, `${id}TaskDefinition`);
  taskDefinition.taskRole.attachManagedPolicy(ssmPolicy);
  taskDefinition
    .addContainer(`${id}Container`, {
      image: containerProperties.imageProvider(stack),
      memoryLimitMiB: 256,
      environment: containerProperties.environment,
    })
    .addPortMappings({
      containerPort: containerProperties.containerPort,
      protocol: ecs.Protocol.Tcp,
    });
  return taskDefinition;
};

const configureClusterAndServices = (
  id: string,
  stack: cdk.Stack,
  certificate: cm.ICertificate,
  containerProperties: ContainerProperties[]) => {

  // NOTE: Limit AZs to avoid reaching resource quotas
  const vpc = new ec2.VpcNetwork(stack, `${id}Vpc`, { maxAZs: 2 });
  const cluster = new ecs.Cluster(stack, `${id}Cluster`, { vpc });

  const services = containerProperties.map((container) => 
    new ecs.FargateService(stack, `${container.id}FargateService`, {
    cluster,
    taskDefinition: createTaskDefinition(`${container.id}`, stack, container),
  }));

  const loadBalancer = new elbv2.ApplicationLoadBalancer(stack, `${id}LoadBalancer`, {
    vpc,
    internetFacing: true,
  });
  createHttpsRedirect(id, stack, loadBalancer);

  const listener = loadBalancer.addListener(`${id}HttpsListener`, {
      port: 443,
      certificateArns: [certificate.certificateArn],
    });
  
  services.forEach((service, i) =>
    listener.addTargets(`${containerProperties[i].id}HttpTarget`, {
        protocol: elbv2.ApplicationProtocol.Http,
        port: containerProperties[i].containerPort,
        targets: [service],
        pathPattern: containerProperties[i].pathPattern,
        // Specify priority only if path is specified
        priority: containerProperties[i].pathPattern ? i * 10 + 20 : undefined,
    }));
  return { vpc, loadBalancer, services };
};

export function createStack(scope: cdk.App,
  id: string,
  containerProperties: ContainerProperties[],
  domainProperties: DomainProperties,
  tags: Tag[],
  props?: cdk.StackProps)
{
  const stack = new cdk.Stack(scope, id, props);

  const certificate = cm.Certificate.import(stack, `${id}Certificate`, {
    certificateArn: domainProperties.domainCertificateArn,
  });
  const { vpc, loadBalancer, services } = configureClusterAndServices(id, stack, certificate, containerProperties);
  tags.forEach((tag) => vpc.node.apply(new cdk.Tag(tag.name, tag.value)));
  tags.forEach((tag) => loadBalancer.node.apply(new cdk.Tag(tag.name, tag.value)));
  tags.forEach((tag) => services.forEach((s) => s.node.apply(new cdk.Tag(tag.name, tag.value))));

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
