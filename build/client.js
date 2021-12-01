var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = void 0;
const events_1 = require("events");
const node_jose_1 = __importDefault(require("node-jose"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const got_1 = __importDefault(require("./got"));
const config_1 = __importDefault(require("./config"));
const lib_1 = require("./lib");
class Client extends events_1.EventEmitter {
    constructor(verbose = false) {
        super();
        this.verbose = false;
        /**
         * This is set once we receive it from the `content-location` response
         * header from the kick-off request. Its presence means that an export/import
         * procedure has already been started on the backend. If `client.cancel()`
         * is called and this is not null, the client will issue a DELETE request
         * to this location to cancel the job on the backend. After the import is
         * completed (successfully or not), this property will be reset back to null.
         */
        this.statusLocation = null;
        /**
         * A reference to the cancelable kick-off request promise. This will only be
         * set while the kick-off request is pending. Used by the `cancel` method to
         * abort the kick-off request if it is currently running.
         */
        this.kickOffRequest = null;
        /**
         * A reference to the cancelable authorization request promise. This will
         * only be set while the authorization request is pending. Used by the
         * `cancel` method to abort the authorization request if it is currently
         * running.
         */
        this.authRequest = null;
        /**
         * A reference to the cancelable status request promise. This will only be
         * set while the status request is pending. Used by the `cancel` method to
         * abort the status request if it is currently running.
         */
        this.statusRequest = null;
        /**
         * A reference to the cancelable cancellation request promise. This will
         * only be set while the cancellation request is pending. Used by the
         * `cancel` method to abort previously started cancellation requests.
         * This is needed to caver rare cases where the the user cancels the import
         * more then once (eg: hit Ctrl+C twice)
         */
        this.cancellationRequest = null;
        this.verbose = !!verbose;
        this.abortController = new AbortController();
    }
    onError(e) {
        this.emit("error", e);
    }
    buildKickOffBody(params) {
        const body = {
            resourceType: "Parameters",
            parameter: [
                {
                    name: "exportUrl",
                    valueUrl: params.exportUrl
                },
                {
                    name: "exportType",
                    valueCode: params.importType
                }
            ]
        };
        // _since (single valueInstant parameter) ------------------------------
        if (params._since) {
            body.parameter.push({
                name: "_since",
                valueInstant: params._since
            });
        }
        // _outputFormat (single valueString parameter) ------------------------
        if (params._outputFormat) {
            body.parameter.push({
                name: "_outputFormat",
                valueString: params._outputFormat
            });
        }
        // patient (sent as one or more valueReference params) -----------------
        if (params.patient) {
            body.parameter = body.parameter.concat(lib_1.asArray(params.patient).map((id) => ({
                name: "patient",
                valueReference: { reference: `Patient/${id}` }
            })));
        }
        // _type (sent as one or more valueString params) ----------------------
        if (params._type) {
            body.parameter = body.parameter.concat(lib_1.asArray(params._type).map((type) => ({
                name: "_type",
                valueString: type
            })));
        }
        // _elements (sent as one or more valueString params) ------------------
        if (params._elements) {
            body.parameter = body.parameter.concat(lib_1.asArray(params._elements).map((type) => ({
                name: "_elements",
                valueString: type
            })));
        }
        // _typeFilter (sent as one or more valueString params) ----------------
        if (params._typeFilter) {
            body.parameter = body.parameter.concat(lib_1.asArray(params._typeFilter).map((type) => ({
                name: "_typeFilter",
                valueString: type
            })));
        }
        // includeAssociatedData (sent as one or more valueString params) ------
        if (params.includeAssociatedData) {
            body.parameter = body.parameter.concat(lib_1.asArray(params.includeAssociatedData).map((type) => ({
                name: "includeAssociatedData",
                valueString: type
            })));
        }
        return body;
    }
    async cancel() {
        // Abort wait timeouts (if any)
        this.abortController.abort();
        // Abort authorization request (if pending)
        if (this.authRequest) {
            this.authRequest.cancel();
            this.authRequest = null;
            this.emit("abort", "Aborted authorization request");
        }
        // Abort kick-off request (if pending)
        if (this.kickOffRequest) {
            this.kickOffRequest.cancel();
            this.kickOffRequest = null;
            this.emit("abort", "Aborted kick-off request");
        }
        // Abort status request (if pending)
        if (this.statusRequest) {
            this.statusRequest.cancel();
            this.statusRequest = null;
            this.emit("abort", "Aborted status request");
        }
        // Cancel previous cancellation request (if pending)
        if (this.cancellationRequest) {
            this.cancellationRequest.cancel();
            this.cancellationRequest = null;
            this.emit("abort", "Aborted previous cancellation request");
        }
        // Cancel the import on the backend (if started)
        if (this.statusLocation) {
            await lib_1.wait(100);
            const answer = await lib_1.ask("Do you want to cancel and remove the import job on the server (Y/n)?");
            process.stdout.write("\r\x1b[2K");
            if (answer.toLowerCase() === "n") {
                console.log("  -> Import job left to expire on the server");
                return;
            }
            if (!this.statusLocation) {
                console.log("  -> Import completed while waiting for your answer");
                return;
            }
            this.cancellationRequest = got_1.default(this.statusLocation, {
                method: "DELETE",
                headers: { accept: "application/json" },
                responseType: "json",
                context: {
                    verbose: this.verbose
                }
            });
            console.log("  -> Server asked to abort the import:");
            return this.cancellationRequest.then(res => {
                this.cancellationRequest = null;
                if (res.body.resourceType === "OperationOutcome") {
                    const o = res.body;
                    console.log("  -> " + o.issue.map(i => `${i.code} ${i.severity}: ${i.diagnostics || i.details?.text || "Unknown error"}`).join("\n  -> "));
                }
                else {
                    console.log("  -> ", res.body);
                }
                if (res.statusCode < 200 || res.statusCode >= 400) {
                    console.log("  -> Cancellation request failed");
                }
            }).catch(e => {
                this.cancellationRequest = null;
                if (!(e instanceof lib_1.AbortError)) {
                    this.onError(e);
                }
            });
        }
    }
    async authorize() {
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
        this.authRequest = got_1.default(consumerTokenUrl, {
            method: "POST",
            responseType: "json",
            form: {
                scope: "system/*.*",
                grant_type: "client_credentials",
                client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                client_assertion: token
            },
            context: {
                verbose: this.verbose
            }
        });
        return this.authRequest.then(res => {
            this.authRequest = null;
            return res.body.access_token;
        });
    }
    async kickOff(params) {
        if (!this.accessToken) {
            try {
                this.accessToken = await this.authorize();
            }
            catch (e) {
                return this.onError(e);
            }
        }
        const body = this.buildKickOffBody(params);
        this.emit("kickOffStart", body);
        this.kickOffRequest = got_1.default(config_1.default.consumerKickOffEndpoint, {
            method: "POST",
            followRedirect: false,
            json: body,
            throwHttpErrors: false,
            headers: {
                accept: "application/fhir+json",
                authorization: `bearer ${this.accessToken}`
            },
            responseType: "json",
            context: {
                verbose: this.verbose
            }
        });
        return this.kickOffRequest.then(res => {
            this.kickOffRequest = null;
            if (res.statusCode === 202) {
                const loc = res.headers["content-location"];
                if (loc) {
                    this.statusLocation = loc;
                    this.emit("kickOffComplete", res);
                    return this.waitForImport();
                }
            }
            this.emit("error", lib_1.errorFromResponse(res));
            return res;
        })
            .catch(e => this.onError(e));
    }
    /**
     * Calls the statusLocation repeatedly until a 200 response status code is
     * received. Emits multiple "progress" events and one "importComplete" event
     * at the end (or an "error" event). The pooling frequency is controlled by
     * the `statusPoolFrequency` configuration variable. The process can be
     * aborted at any time by calling the `cancel` method.
     * @param prevProgress The last known progress value (0 to 100), passed
     * internally in recursive calls. If the current progress equals the
     * previous one, no progress event will be emitted.
     */
    async waitForImport(prevProgress) {
        this.statusRequest = got_1.default(this.statusLocation, {
            headers: { accept: "application/json" },
            responseType: "json",
            context: {
                verbose: this.verbose
            }
        });
        return this.statusRequest.then(async (res) => {
            this.statusRequest = null;
            if (res.statusCode === 202) {
                const progress = Math.round(parseFloat(String(res.headers["x-progress"] || "0")));
                if (progress !== prevProgress) {
                    // NOTE: The x-status header is not part of the spec!
                    const status = String(res.headers["x-status"] || "Please wait...");
                    this.emit("progress", { value: progress, message: status });
                }
                await lib_1.wait(config_1.default.statusPoolFrequency, this.abortController.signal);
                return this.waitForImport(progress);
            }
            else if (res.statusCode === 200) {
                this.statusLocation = null;
                this.emit("progress", { value: 100, message: "Import completed" });
                this.emit("importComplete", res);
            }
            return res;
        })
            .catch(e => this.onError(e));
    }
}
exports.Client = Client;
