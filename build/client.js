var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = void 0;
const events_1 = require("events");
const got_1 = __importDefault(require("./got"));
const config_1 = __importDefault(require("./config"));
const auth_1 = require("./auth");
const lib_1 = require("./lib");
class Client extends events_1.EventEmitter {
    constructor(verbose = false) {
        super();
        this.verbose = false;
        this.verbose = !!verbose;
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
    async kickOff(params) {
        if (!this.accessToken) {
            try {
                this.accessToken = await auth_1.authorize(this.verbose);
            }
            catch (e) {
                return this.onError(e);
            }
        }
        const body = this.buildKickOffBody(params);
        this.emit("kickOffStart", body);
        return got_1.default(config_1.default.consumerKickOffEndpoint, {
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
        })
            .then(res => {
            if (res.statusCode === 202) {
                const loc = res.headers["content-location"];
                if (loc) {
                    this.emit("kickOffComplete", res);
                    return this.waitForImport(loc);
                }
            }
            this.emit("error", lib_1.errorFromResponse(res));
            return res;
        })
            .catch(e => this.onError(e));
    }
    async waitForImport(statusLocation, prevProgress) {
        return got_1.default(statusLocation, {
            headers: { accept: "application/json" },
            responseType: "json",
            context: {
                verbose: this.verbose
            }
        }).then(async (res) => {
            if (res.statusCode === 202) {
                const progress = Math.round(parseFloat(String(res.headers["x-progress"] || "0")));
                if (progress !== prevProgress) {
                    // NOTE: The x-status header is not part of the spec!
                    const status = String(res.headers["x-status"] || "Please wait...");
                    this.emit("progress", { value: progress, message: status });
                }
                await lib_1.wait(config_1.default.statusPoolFrequency);
                return this.waitForImport(statusLocation, progress);
            }
            else if (res.statusCode === 200) {
                this.emit("progress", { value: 100, message: "Import completed" });
                this.emit("importComplete", res);
            }
            return res;
        }).catch(e => this.onError(e));
    }
}
exports.Client = Client;
