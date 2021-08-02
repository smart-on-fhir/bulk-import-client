var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = void 0;
const node_jose_1 = __importDefault(require("node-jose"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const got_1 = __importDefault(require("./got"));
const config_1 = __importDefault(require("./config"));
async function authorize(verbose = false) {
    const { clientId, consumerTokenUrl, accessTokenLifetime, privateKey } = config_1.default;
    const claims = {
        iss: clientId,
        sub: clientId,
        aud: consumerTokenUrl,
        exp: Math.round(Date.now() / 1000) + accessTokenLifetime,
        jti: node_jose_1.default.util.randomBytes(10).toString("hex")
    };
    const key = await node_jose_1.default.JWK.asKey(privateKey, "json");
    const token = jsonwebtoken_1.default.sign(claims, key.toPEM(true), { algorithm: key.alg });
    const { body } = await got_1.default(consumerTokenUrl, {
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
exports.authorize = authorize;
