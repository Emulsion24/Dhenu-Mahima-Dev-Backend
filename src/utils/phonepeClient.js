import { StandardCheckoutClient, Env } from 'pg-sdk-node';
import dotenv from 'dotenv';
dotenv.config();
const clientId = process.env.PHONEPE_CLIENT_ID;
const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
const clientVersion = '1';  //insert your client version here
const env = process.env.PHONEPE_ENV      //change to Env.PRODUCTION when you go live
 
const phonepe = StandardCheckoutClient.getInstance(clientId, clientSecret, clientVersion, env);

export default phonepe;
