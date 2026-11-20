// Writes deploy/template.yaml. CloudFormation does not accept YAML anchors, so the
// repeated cache behaviours are written out here instead of by hand.
//   node deploy/make-template.mjs
import { writeFile } from "node:fs/promises";

const behaviour = (pattern, policy) => `          - PathPattern: ${pattern}
            TargetOriginId: site
            ViewerProtocolPolicy: redirect-to-https
            AllowedMethods: [GET, HEAD, OPTIONS]
            Compress: true
            CachePolicyId: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad
            ResponseHeadersPolicyId: !Ref ${policy}
            FunctionAssociations:
              - EventType: viewer-request
                FunctionARN: !GetAtt IndexFunction.FunctionMetadata.FunctionARN`;

const PUBLIC = ['"*agent-manifest.json"', '"*.network.json"', '"*links.json"', '"*agent-mcp.json"', '"*.well-known/*"', "!Ref ExtraCorsPath"];

const template = `AWSTemplateFormatVersion: "2010-09-09"
Description: >
  Hosts a static agentic website (Open Agentic Web, MVP Profile 0.3) on a private
  Amazon S3 bucket behind Amazon CloudFront, with the response headers the reference
  hosting notes ask for. Written by deploy/make-template.mjs.

Parameters:
  ExtraCorsPath:
    Type: String
    Default: "harness/*"
    Description: >
      One more path pattern to serve with Access-Control-Allow-Origin "*", for files other
      sites import as modules. Agent Crash Test uses it for its harness. A pattern that
      matches nothing is harmless.

Resources:
  SiteBucket:
    Type: AWS::S3::Bucket
    Properties:
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256
      OwnershipControls:
        Rules:
          - ObjectOwnership: BucketOwnerEnforced

  OriginAccessControl:
    Type: AWS::CloudFront::OriginAccessControl
    Properties:
      OriginAccessControlConfig:
        Name: !Sub "\${AWS::StackName}-oac"
        OriginAccessControlOriginType: s3
        SigningBehavior: always
        SigningProtocol: sigv4

  # Only this distribution may read the bucket, and only over TLS.
  SiteBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref SiteBucket
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Sid: AllowCloudFrontRead
            Effect: Allow
            Principal:
              Service: cloudfront.amazonaws.com
            Action: s3:GetObject
            Resource: !Sub "\${SiteBucket.Arn}/*"
            Condition:
              StringEquals:
                "AWS:SourceArn": !Sub "arn:\${AWS::Partition}:cloudfront::\${AWS::AccountId}:distribution/\${Distribution}"
          - Sid: DenyInsecureTransport
            Effect: Deny
            Principal: "*"
            Action: "s3:*"
            Resource:
              - !GetAtt SiteBucket.Arn
              - !Sub "\${SiteBucket.Arn}/*"
            Condition:
              Bool:
                "aws:SecureTransport": "false"

  # A folder address such as /shops/corner-weak/ serves that folder's index.html. An
  # agentic site under a subpath needs this: its site base is the folder.
  IndexFunction:
    Type: AWS::CloudFront::Function
    Properties:
      Name: !Sub "\${AWS::StackName}-index"
      AutoPublish: true
      FunctionConfig:
        Comment: Serve index.html for folder addresses
        Runtime: cloudfront-js-2.0
      FunctionCode: |
        function handler(event) {
          var request = event.request;
          if (request.uri.endsWith("/")) {
            request.uri += "index.html";
          }
          return request;
        }

  # Every response. No X-Frame-Options and no frame-ancestors: other agent sites load
  # bridge/action-bridge.html in a hidden frame.
  BaseHeaders:
    Type: AWS::CloudFront::ResponseHeadersPolicy
    Properties:
      ResponseHeadersPolicyConfig:
        Name: !Sub "\${AWS::StackName}-base"
        SecurityHeadersConfig:
          ContentTypeOptions:
            Override: true
          ReferrerPolicy:
            ReferrerPolicy: strict-origin-when-cross-origin
            Override: true
          StrictTransportSecurity:
            AccessControlMaxAgeSec: 31536000
            IncludeSubdomains: false
            Override: true

  # The public agent files: any site's browser may read them.
  PublicFileHeaders:
    Type: AWS::CloudFront::ResponseHeadersPolicy
    Properties:
      ResponseHeadersPolicyConfig:
        Name: !Sub "\${AWS::StackName}-public"
        CorsConfig:
          AccessControlAllowCredentials: false
          AccessControlAllowHeaders:
            Items: ["*"]
          AccessControlAllowMethods:
            Items: [GET, HEAD, OPTIONS]
          AccessControlAllowOrigins:
            Items: ["*"]
          OriginOverride: true
        SecurityHeadersConfig:
          ContentTypeOptions:
            Override: true
          StrictTransportSecurity:
            AccessControlMaxAgeSec: 31536000
            IncludeSubdomains: false
            Override: true

  # The coded-tool worker runs untrusted code: it may load nothing and call nothing.
  WorkerHeaders:
    Type: AWS::CloudFront::ResponseHeadersPolicy
    Properties:
      ResponseHeadersPolicyConfig:
        Name: !Sub "\${AWS::StackName}-worker"
        SecurityHeadersConfig:
          ContentSecurityPolicy:
            ContentSecurityPolicy: "default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'"
            Override: true
          ContentTypeOptions:
            Override: true

  Distribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        Enabled: true
        Comment: !Sub "\${AWS::StackName} agentic website"
        HttpVersion: http2and3
        IPV6Enabled: true
        PriceClass: PriceClass_100
        DefaultRootObject: index.html
        Origins:
          - Id: site
            DomainName: !GetAtt SiteBucket.RegionalDomainName
            OriginAccessControlId: !Ref OriginAccessControl
            S3OriginConfig:
              OriginAccessIdentity: ""
        # CachePolicyId is the managed policy CachingDisabled. An agentic site's files
        # change together; a cached mix of old and new breaks it, and the traffic is small.
        DefaultCacheBehavior:
          TargetOriginId: site
          ViewerProtocolPolicy: redirect-to-https
          AllowedMethods: [GET, HEAD, OPTIONS]
          Compress: true
          CachePolicyId: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad
          ResponseHeadersPolicyId: !Ref BaseHeaders
          FunctionAssociations:
            - EventType: viewer-request
              FunctionARN: !GetAtt IndexFunction.FunctionMetadata.FunctionARN
        CacheBehaviors:
${behaviour('"*runtime/sandbox-worker.js"', "WorkerHeaders")}
${PUBLIC.map(pattern => behaviour(pattern, "PublicFileHeaders")).join("\n")}

Outputs:
  SiteUrl:
    Description: The site's HTTPS address
    Value: !Sub "https://\${Distribution.DomainName}/"
  BucketName:
    Description: Upload the site folder here
    Value: !Ref SiteBucket
  DistributionId:
    Value: !Ref Distribution
`;

await writeFile(new URL("template.yaml", import.meta.url), template);
console.log("wrote deploy/template.yaml");
