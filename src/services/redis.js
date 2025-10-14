import { createClient } from "redis";
import dotenv from "dotenv";
dotenv.config()
const redisClient=createClient({
    url:process.env.REDIS_URL
});

redisClient.on("error",(error)=>
console.log("Redis Error:",error));

await redisClient.connect();
console.log("Redis Connected");
export default redisClient;