# <%= appName %>

generated project by gamechanger 

## Getting started
Generate your AWS infrastructure

```
cd terraform
terraform init
terraform apply -var-file="terraform.tfvar"
```
lambdas are deployed via terraform and can be tested in lambda section of Amazon's Console

## test lambdas locally

to test lambdas locally and reduce your testing time, you can use AWS SAM CLI: https://github.com/aws/aws-sam-cli/releases/latest/download/AWS_SAM_CLI_64_PY3.msi


*you need to have docker installed and running*


Once the AWS infrastructure is generated, you can get :
 - the Arn (Amazon ressource name) 
 - the secret arn ( secret Amazon ressource name) in the file ***terraform.tfstate***

be placed on the root directory and build The virtual container which will perform our lambdas with

```
sam build
```

then you can edit the event.json file to perform the lambda of your choice


```
sam local invoke -e ./event.json
```


You have to
 ```
sam build
```  
everytime you make a change on your lambdas before invoking and event again .
be sure you have a large-enough time-out on the template.yaml properties to fit your lambda requirements

## redeploy lambdas 
If you change your lambda code and want to redeploy it on AWS, you have just to rebuild the zip file by typing:
```
zip lambda.zip -r README.md database graphql initDatabase cleanDatabase directives existTable index.js node_modules package.json
```
The generated zip file have to be redeploy using the AWS console and its 'Upload from' button