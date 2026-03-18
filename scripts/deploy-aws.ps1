param(
  [string]$StackName = "vue-ts-webapp",
  [string]$ProjectName = "vue-ts-app",
  [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"

Write-Host "Building app..."
npm run build

Write-Host "Deploying CloudFormation stack '$StackName' in region '$Region'..."
aws cloudformation deploy `
  --stack-name $StackName `
  --template-file infra/cloudformation/static-site.yaml `
  --capabilities CAPABILITY_NAMED_IAM `
  --region $Region `
  --parameter-overrides ProjectName=$ProjectName

$stackData = aws cloudformation describe-stacks `
  --stack-name $StackName `
  --region $Region `
  --query "Stacks[0].Outputs" | ConvertFrom-Json

$bucketName = ($stackData | Where-Object { $_.OutputKey -eq "WebsiteBucketName" }).OutputValue
$distributionId = ($stackData | Where-Object { $_.OutputKey -eq "CloudFrontDistributionId" }).OutputValue
$domainName = ($stackData | Where-Object { $_.OutputKey -eq "CloudFrontDomainName" }).OutputValue

if (-not $bucketName -or -not $distributionId) {
  throw "Could not read CloudFormation outputs (WebsiteBucketName / CloudFrontDistributionId)."
}

Write-Host "Syncing assets to s3://$bucketName..."
aws s3 sync dist/ "s3://$bucketName" --delete --region $Region

Write-Host "Invalidating CloudFront cache..."
aws cloudfront create-invalidation `
  --distribution-id $distributionId `
  --paths "/*"

Write-Host "Deployment completed."
Write-Host "Website URL: https://$domainName"
