import { CfnOutput, Duration, RemovalPolicy, Stack, Validations } from 'aws-cdk-lib'
import type { StackProps } from 'aws-cdk-lib'
import {
  Distribution,
  HttpVersion,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront'
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins'
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  ObjectOwnership,
} from 'aws-cdk-lib/aws-s3'
import type { Construct } from 'constructs'
import { resourceName } from './config'
import type { Stage } from './config'

export interface WebStackProps extends StackProps {
  readonly stage: Stage
}

// Sitio estatico del front (apps/web/dist): bucket S3 privado servido por CloudFront con
// Origin Access Control. Los archivos los sube el workflow con aws s3 sync, no CDK: un
// BucketDeployment crearia una Lambda cuyo rol el limite de permisos no deja usar S3.
export class WebStack extends Stack {
  readonly bucket: Bucket
  readonly distribution: Distribution
  // Origen del front (https://<id>.cloudfront.net) para el CORS de la API
  readonly url: string

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props)
    const { stage } = props
    const isProd = stage === 'prod'

    this.bucket = new Bucket(this, 'WebBucket', {
      // Los nombres de bucket son globales: la cuenta evita choques con otras
      bucketName: `${resourceName(stage, 'web')}-${this.account}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Sin autoDeleteObjects (otra Lambda): en dev hay que vaciar el bucket antes de destruirlo
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    })

    this.distribution = new Distribution(this, 'Distribution', {
      comment: `${resourceName(stage, 'web')} - front del sistema de votacion popular`,
      defaultRootObject: 'index.html',
      httpVersion: HttpVersion.HTTP2_AND_3,
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
        compress: true,
      },
      // El router usa createWebHistory: las rutas del front no existen en S3 (que responde 403
      // sin s3:ListBucket) y se resuelven con index.html
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.seconds(0),
      })),
    })

    this.url = `https://${this.distribution.distributionDomainName}`

    new CfnOutput(this, 'WebBucketName', {
      value: this.bucket.bucketName,
      description: 'Bucket donde se sube apps/web/dist',
    })
    new CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'Distribucion de CloudFront a invalidar despues de subir el front',
    })
    new CfnOutput(this, 'WebUrl', {
      value: this.url,
      description: 'URL publica del front',
    })

    if (stage === 'dev') this.acknowledgeDevFindings()
  }

  // Hallazgos de cdk-nag aceptados en dev, cada uno con su justificacion
  private acknowledgeDevFindings() {
    const findings: Record<string, string> = {
      'AwsSolutions-S1':
        'Dev: sin logs de acceso del bucket; solo CloudFront lee de el (OAC) y no guarda datos de usuarios.',
      'AwsSolutions-CFR1': 'Dev: sin restriccion geografica, el front es publico.',
      'AwsSolutions-CFR2':
        'Dev: sin WAF para mantener el costo bajo; la API tiene throttling propio.',
      'AwsSolutions-CFR3':
        'Dev: sin logs de acceso de CloudFront; se revisan las metricas de la distribucion.',
      'AwsSolutions-CFR4':
        'Dev: usa el certificado por defecto de cloudfront.net, que no permite fijar la version minima de TLS.',
    }
    for (const [id, reason] of Object.entries(findings)) {
      Validations.of(this).acknowledge({ id, reason })
    }
  }
}
