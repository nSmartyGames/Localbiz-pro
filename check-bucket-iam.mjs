import { Storage } from "@google-cloud/storage";
const storage = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
const bucket = storage.bucket(process.env.GOOGLE_CLOUD_STORAGE_BUCKET);
const [metadata] = await bucket.getMetadata();
console.log("uniformBucketLevelAccess:", metadata.iamConfiguration?.uniformBucketLevelAccess);
const [policy] = await bucket.iam.getPolicy();
console.log(JSON.stringify(policy, null, 2));
