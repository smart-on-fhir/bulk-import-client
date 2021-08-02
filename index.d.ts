import { Algorithm } from "jsonwebtoken";

declare namespace ImportClient {

    export interface Config {

        /**
         * This app should be registered with the Data Consumer and should
         * have gotten a client_id upon registration
         */
        clientId: string

        /**
         * The Data Consumer must have a token endpoint which we use to
         * authorize
         */
        consumerTokenUrl: string

        consumerKickOffEndpoint: string

        /**
         * The access token lifetime in seconds. Defaults to 300 (5 min)
         */
        accessTokenLifetime: number

        /**
         * The private key that this client app uses to sign it's tokens
         */
        privateKey: JWK

        /**
         * The public key is not used for anything, except that if you want to
         * register this app as a client somewhere, you can get it from this
         * config variable
         */
        publicKey: JWK

        statusPoolFrequency: number

        ndjsonMaxLineLength: number
    }

    export interface JWK {
        alg: Algorithm
    }

    export interface TokenResponse {
        access_token: string
    }

    export interface BulkDataExportParams {
        _type                ?: string
        _since               ?: string
        _outputFormat        ?: string
        _elements            ?: string
        patient              ?: string
        _typeFilter          ?: string
        includeAssociatedData?: string
    }

    export interface BulkDataImportParams extends BulkDataExportParams {
        importType: string
        exportUrl : string
    }

    export interface ImportResult {
        transactionTime: string
        requiresAccessToken: boolean
        outcome: ImportOutcome[]
        extension?: JsonObject
    }
    
    export interface ImportOutcome {
        extension?: JsonObject
        url: string
        count?: number
    }

    export interface AggregatedImportResult {
        fatal: JsonArray
        error: JsonArray
        warning: JsonArray
        information: JsonArray
    }

    export interface JsonObject { [key: string]: JsonValue; }
    export type JsonPrimitive = string | number | boolean | null;
    export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
    export type JsonArray = JsonValue[];
}