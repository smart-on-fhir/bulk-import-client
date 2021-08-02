import { EventEmitter } from "events"
import { Parameters }   from "fhir/r4"
import got              from "./got"
import config           from "./config"
import { authorize }    from "./auth"
import { ImportClient } from "../index"
import {
    errorFromResponse,
    wait,
    asArray
} from "./lib"

export class Client extends EventEmitter
{
    private verbose = false

    private accessToken: string | undefined;

    constructor(verbose = false) {
        super()
        this.verbose = !!verbose
    }

    private onError(e: Error) {
        this.emit("error", e)
    }

    private buildKickOffBody(params: ImportClient.BulkDataImportParams)
    {
        const body: Parameters = {
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
            body.parameter = body.parameter.concat(
                asArray(params.patient).map((id: any) => ({
                    name : "patient",
                    valueReference : { reference: `Patient/${id}` }
                }))
            );
        }

        // _type (sent as one or more valueString params) ----------------------
        if (params._type) {
            body.parameter = body.parameter.concat(
                asArray(params._type).map((type: any) => ({
                    name: "_type",
                    valueString: type
                }))
            );
        }

        // _elements (sent as one or more valueString params) ------------------
        if (params._elements) {
            body.parameter = body.parameter.concat(
                asArray(params._elements).map((type: any) => ({
                    name: "_elements",
                    valueString: type
                }))
            );
        }

        // _typeFilter (sent as one or more valueString params) ----------------
        if (params._typeFilter) {
            body.parameter = body.parameter.concat(
                asArray(params._typeFilter).map((type: any) => ({
                    name: "_typeFilter",
                    valueString: type
                }))
            );
        }

        // includeAssociatedData (sent as one or more valueString params) ------
        if (params.includeAssociatedData) {
            body.parameter = body.parameter.concat(
                asArray(params.includeAssociatedData).map((type: any) => ({
                    name: "includeAssociatedData",
                    valueString: type
                }))
            );
        }

        return body
    }

    public async kickOff(params: ImportClient.BulkDataImportParams)
    {
        if (!this.accessToken) {
            try {
                this.accessToken = await authorize(this.verbose);
            } catch (e) {
                return this.onError(e)
            }
        }

        const body = this.buildKickOffBody(params);

        this.emit("kickOffStart", body)

        return got(config.consumerKickOffEndpoint, {
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
                    this.emit("kickOffComplete", res)
                    return this.waitForImport(loc)
                }
            }
            this.emit("error", errorFromResponse(res));
            return res;
        })
        .catch(e => this.onError(e))
    }

    private async waitForImport(statusLocation: string, prevProgress?: number): Promise<any>
    {
        return got(statusLocation, {
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
                await wait(config.statusPoolFrequency);
                return this.waitForImport(statusLocation, progress);
            }
            else if (res.statusCode === 200) {
                this.emit("progress", { value: 100, message: "Import completed" });
                this.emit("importComplete", res)
            }
            return res
        }).catch(e => this.onError(e))
    }
}
