import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as route53 from '@aws-cdk/aws-route53';
import * as cm from '@aws-cdk/aws-certificatemanager';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';

// Structure for tagging objects created
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
  // The image to run
  image: ecs.ContainerImage;
  // The container port
  containerPort: number;
  // Unique id of the service
  id: string;
  // Environment variables for the container
  environment: { [key: string]: string; };
  // Define the path or host header for routing traffic
  pathPattern?: string;
  hostHeader?: string;
}

/// Creates ALB redirect from port 80 to the HTTPS endpoint
const createHttpsRedirect = (id: string, scope: cdk.Construct, loadBalancer: elbv2.ApplicationLoadBalancer) => {
  const port = 80;
  loadBalancer.connections.allowFromAnyIpv4(ec2.Port.tcp(port));
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

const createTaskDefinition = (
  id: string,
  stack: cdk.Stack,
  containerProperties: ContainerProperties,
  tags: Tag[]) => {
  const taskDefinition = new ecs.FargateTaskDefinition(stack, `${id}TaskDefinition`);
  taskDefinition
    .addContainer(`${id}Container`, {
      image: containerProperties.image,
      memoryLimitMiB: 256,
      environment: containerProperties.environment,
      logging: new ecs.AwsLogDriver({ streamPrefix: `${id}` }),
    })
    .addPortMappings({
      containerPort: containerProperties.containerPort,
      protocol: ecs.Protocol.TCP,
    });
  tags.forEach((tag) => taskDefinition.node.applyAspect(new cdk.Tag(tag.name, tag.value)));
  return taskDefinition;
};

const configureClusterAndServices = (
  id: string,
  stack: cdk.Stack,
  cluster: ecs.Cluster,
  certificate: cm.ICertificate,
  containerProperties: ContainerProperties[],
  tags: Tag[]) => {

  const services = containerProperties.map((container) => 
    new ecs.FargateService(stack, `${container.id}FargateService`, {
    cluster,
    taskDefinition: createTaskDefinition(`${container.id}`, stack, container, tags),
  }));

  const loadBalancer = new elbv2.ApplicationLoadBalancer(stack, `${id}LoadBalancer`, {
    vpc: cluster.vpc,
    internetFacing: true,
  });
  createHttpsRedirect(id, stack, loadBalancer);

  const listener = loadBalancer.addListener(`${id}HttpsListener`, {
      port: 443,
      certificateArns: [certificate.certificateArn],
    });
  
  services.forEach((service, i) =>
    service.registerLoadBalancerTargets({
      containerName: `${containerProperties[i].id}Container`,
      containerPort: containerProperties[i].containerPort,
      newTargetGroupId: `${containerProperties[i].id}TargetGroup`,
      listener: ecs.ListenerConfig.applicationListener(listener, {
        protocol: elbv2.ApplicationProtocol.HTTP,
        priority: 10 + i * 10,
        pathPattern: containerProperties[i].pathPattern,
        hostHeader: containerProperties[i].hostHeader,
    })
  }));

  listener.addFixedResponse(`${id}FixedResponse`, {
    statusCode: '404',
    messageBody: 'Not Found',
  });
  return { loadBalancer, services };
};

/** Constructs the stack with given properties.
 * @param scope               The CDK app
 * @param id                  The application identifier
 * @param containerProperties Defines the tasks to run
 * @param domainProperties    Define the domain to be registered with Route 53
 * @param tags                The tags to apply to created services
 * @param props               The CDK stack properties
 * @param vpc                 The VPC to use. Leave as undefined if using a stack created VPC.
*/
export const createStack = (
  scope: cdk.App,
  id: string,
  containerProperties: ContainerProperties[],
  domainProperties: DomainProperties,
  tags: Tag[],
  props: cdk.StackProps,
  vpc?: ec2.Vpc) =>
{
  const stack = new cdk.Stack(scope, id, props);

  const certificate = cm.Certificate.fromCertificateArn(stack, `${id}Certificate`,
    domainProperties.domainCertificateArn);
  // NOTE: Limit AZs to avoid reaching resource quotas
  const vpcInUse = vpc ? vpc : new ec2.Vpc(stack, `${id}Vpc`, { maxAzs: 2 });
  const cluster = new ecs.Cluster(stack, `${id}Cluster`, { vpc: vpcInUse });
  const { loadBalancer, services } = configureClusterAndServices(id, stack, cluster, certificate, containerProperties, tags);
  tags.forEach((tag) => vpcInUse.node.applyAspect(new cdk.Tag(tag.name, tag.value)));
  tags.forEach((tag) => loadBalancer.node.applyAspect(new cdk.Tag(tag.name, tag.value)));
  tags.forEach((tag) => services.forEach((s) => s.node.applyAspect(new cdk.Tag(tag.name, tag.value))));

  const zone = route53.HostedZone.fromLookup(stack, `${id}Zone`, {
    domainName: domainProperties.domainName
  });

  new route53.CnameRecord(stack, `${id}Site`, {
    zone,
    recordName: domainProperties.subdomainName,
    domainName: loadBalancer.loadBalancerDnsName,
  });

  // Output the DNS name where you can access your service
  new cdk.CfnOutput(stack, `${id}DNS`, { value: loadBalancer.loadBalancerDnsName });
  new cdk.CfnOutput(stack, `SiteDNS`, { value: `${domainProperties.subdomainName}.${domainProperties.domainName}` });
  return stack;
}
