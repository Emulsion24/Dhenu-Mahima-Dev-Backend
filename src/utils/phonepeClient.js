import { StandardCheckoutClient, Env } from 'pg-sdk-node'; // <--- Ensure Env is imported!
import dotenv from 'dotenv';
dotenv.config();

const clientId = process.env.PHONEPE_CLIENT_ID; // Should be Merchant ID
const clientSecret = process.env.PHONEPE_CLIENT_SECRET; // Should be Secret Key / Salt Key
const clientVersion = parseInt(process.env.PHONEPE_CLIENT_VERSION) || 1; // Use parseInt
const envString = process.env.PHONEPE_ENV;

// Map the string from .env to the SDK's Env constant
const env = envString === 'PRODUCTION' 
    ? Env.PRODUCTION 
    : Env.SANDBOX; // Use SANDBOX for UAT/Testing

// Log the parameters for debugging the 400 error
console.log('PhonePe Client Init:', { clientId, clientVersion, env: envString });
 
const phonePe = StandardCheckoutClient.getInstance(clientId, clientSecret, clientVersion, env);

export default phonePe;