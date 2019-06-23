import * as cdk from '@aws-cdk/cdk';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as route53 from '@aws-cdk/aws-route53';
import * as cm from '@aws-cdk/aws-certificatemanager';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';

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
      logging: new ecs.AwsLogDriver(stack, `${id}Logs`, { streamPrefix: `${id}` }),
    })
    .addPortMappings({
      containerPort: containerProperties.containerPort,
      protocol: ecs.Protocol.Tcp,
    });
  tags.forEach((tag) => taskDefinition.node.applyAspect(new cdk.Tag(tag.name, tag.value)));
  return taskDefinition;
};

const configureClusterAndServices = (
  id: string,
  stack: cdk.Stack,
  vpc: ec2.Vpc,
  certificate: cm.ICertificate,
  containerProperties: ContainerProperties[],
  tags: Tag[]) => {
  const cluster = new ecs.Cluster(stack, `${id}Cluster`, { vpc });

  const services = containerProperties.map((container) => 
    new ecs.FargateService(stack, `${container.id}FargateService`, {
    cluster,
    taskDefinition: createTaskDefinition(`${container.id}`, stack, container, tags),
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
        hostHeader: containerProperties[i].hostHeader,
        priority: 20 + i * 10,
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
  const vpcInUse = vpc ? vpc : new ec2.Vpc(stack, `${id}Vpc`, { maxAZs: 2 });
  const { loadBalancer, services } = configureClusterAndServices(id, stack, vpcInUse, certificate, containerProperties, tags);
  tags.forEach((tag) => vpcInUse.node.applyAspect(new cdk.Tag(tag.name, tag.value)));
  tags.forEach((tag) => loadBalancer.node.applyAspect(new cdk.Tag(tag.name, tag.value)));
  tags.forEach((tag) => services.forEach((s) => s.node.applyAspect(new cdk.Tag(tag.name, tag.value))));

  const zone = new route53.HostedZoneProvider(stack, {
    domainName: domainProperties.domainName
  }).findAndImport(stack, `${id}Zone`);

  new route53.CnameRecord(stack, `${id}Site`, {
    zone,
    recordName: domainProperties.subdomainName,
    domainName: loadBalancer.loadBalancerDnsName,
  });

  // Output the DNS name where you can access your service
  new cdk.CfnOutput(stack, `${id}DNS`, { value: loadBalancer.loadBalancerDnsName });
  return stack;
}
