import jose             from "node-jose"
import jwt              from "jsonwebtoken"
import got              from "./got"
import config           from "./config"
import { ImportClient } from ".."


export async function authorize(verbose = false)
{
    const { clientId, consumerTokenUrl, accessTokenLifetime, privateKey } = config;

    const claims = {
        iss: clientId,
        sub: clientId,
        aud: consumerTokenUrl,
        exp: Math.round(Date.now() / 1000) + accessTokenLifetime,
        jti: jose.util.randomBytes(10).toString("hex")
    };

    const key = await jose.JWK.asKey(privateKey, "json");

    const token = jwt.sign(claims, key.toPEM(true), { algorithm: key.alg as jwt.Algorithm });

    const { body } = await got<ImportClient.TokenResponse>(consumerTokenUrl, {
        method: "POST",
        responseType: "json",
        form: {
            scope: "system/*.*",
            grant_type: "client_credentials",
            client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            client_assertion: token
        },
        context: {
            verbose
        }
    });

    return body.access_token;
}
