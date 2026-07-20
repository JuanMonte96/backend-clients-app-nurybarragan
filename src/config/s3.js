import {S3Client} from "@aws-sdk/client-s3"; 

const requiredEnvironmentVariables = [
    'AWS_REGION',
    'AWS_S3_BUCKET',
    'AWS_S3_CERTIFICATES_PREFIX'
];

for (const variableName of requiredEnvironmentVariables) {
    if(!process.env[variableName]){
        throw new Error(`Missing required environment variable: ${variableName}`);
    }
}

export const s3Client = new S3Client({
    region: process.env.AWS_REGION
})

export const s3BucketName = process.env.AWS_S3_BUCKET;
export const s3CertificatesPrefix = process.env.AWS_S3_CERTIFICATES_PREFIX.replace(/^~\/+|\/$/g, '');