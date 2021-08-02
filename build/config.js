Object.defineProperty(exports, "__esModule", { value: true });
const ts_dotenv_1 = require("ts-dotenv");
const schema = {
    CONSUMER_TOKEN_URL: {
        type: String,
        optional: false
    },
    CONSUMER_KICK_OFF_URL: {
        type: String,
        optional: false
    },
    CLIENT_ID: {
        type: String,
        optional: false
    },
    ACCESS_TOKEN_LIFETIME: {
        type: Number,
        optional: true,
        default: 300
    },
    STATUS_POOL_FREQUENCY: {
        type: Number,
        optional: true,
        default: 500
    },
    NDJSON_MAX_LINE_LENGTH: {
        type: Number,
        optional: true,
        default: 100000
    },
    PRIVATE_KEY: {
        type: String,
        optional: false
    },
    PUBLIC_KEY: {
        type: String,
        optional: false
    }
};
const env = ts_dotenv_1.load(schema, __dirname + "/../.env");
const config = {
    privateKey: JSON.parse(env.PRIVATE_KEY),
    publicKey: JSON.parse(env.PUBLIC_KEY),
    clientId: env.CLIENT_ID,
    consumerTokenUrl: env.CONSUMER_TOKEN_URL,
    consumerKickOffEndpoint: env.CONSUMER_KICK_OFF_URL,
    accessTokenLifetime: env.ACCESS_TOKEN_LIFETIME,
    statusPoolFrequency: env.STATUS_POOL_FREQUENCY,
    ndjsonMaxLineLength: env.NDJSON_MAX_LINE_LENGTH,
};
exports.default = config;
