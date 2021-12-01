import { EventEmitter }                from "events"
import { Parameters }                  from "fhir/r4"
import { CancelableRequest, Response } from "got/dist/source"
import got                             from "./got"
import config                          from "./config"
import { ImportClient }                from "../index"
import {
    errorFromResponse,
    wait,
    asArray,
    AbortError,
    ask
} from "./lib"

export class Client extends EventEmitter
{
    private verbose = false

    private accessToken: string | undefined;

    /**
     * An AbortController instance that we use to pass abort signals to cancel
     * any pending wait timeouts
     */
    private abortController: AbortController;

    /**
     * This is set once we receive it from the `content-location` response
     * header from the kick-off request. Its presence means that an export/import
     * procedure has already been started on the backend. If `client.cancel()`
     * is called and this is not null, the client will issue a DELETE request
     * to this location to cancel the job on the backend. After the import is
     * completed (successfully or not), this property will be reset back to null.
     */
    private statusLocation: string | null = null;

    /**
     * A reference to the cancelable kick-off request promise. This will only be
     * set while the kick-off request is pending. Used by the `cancel` method to
     * abort the kick-off request if it is currently running.
     */
    private kickOffRequest: CancelableRequest<Response<any>> | null = null;

    /**
     * A reference to the cancelable authorization request promise. This will
     * only be set while the authorization request is pending. Used by the
     * `cancel` method to abort the authorization request if it is currently
     * running.
     */
    private authRequest: CancelableRequest<Response<any>> | null = null;

    /**
     * A reference to the cancelable status request promise. This will only be
     * set while the status request is pending. Used by the `cancel` method to
     * abort the status request if it is currently running.
     */
    private statusRequest: CancelableRequest<Response<any>> | null = null;

    /**
     * A reference to the cancelable cancellation request promise. This will
     * only be set while the cancellation request is pending. Used by the
     * `cancel` method to abort previously started cancellation requests.
     * This is needed to caver rare cases where the the user cancels the import
     * more then once (eg: hit Ctrl+C twice)
     */
    private cancellationRequest: CancelableRequest<Response<any>> | null = null;

    constructor(verbose = false) {
        super()
        this.verbose = !!verbose
        this.abortController = new AbortController()
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

    public async cancel()
    {
        // Abort wait timeouts (if any)
        this.abortController.abort()

        // Abort authorization request (if pending)
        if (this.authRequest) {
            this.authRequest.cancel()
            this.authRequest = null;
            this.emit("abort", "Aborted authorization request")
        }

        // Abort kick-off request (if pending)
        if (this.kickOffRequest) {
            this.kickOffRequest.cancel()
            this.kickOffRequest = null
            this.emit("abort", "Aborted kick-off request")
        }

        // Abort status request (if pending)
        if (this.statusRequest) {
            this.statusRequest.cancel()
            this.statusRequest = null
            this.emit("abort", "Aborted status request")
        }

        // Cancel previous cancellation request (if pending)
        if (this.cancellationRequest) {
            this.cancellationRequest.cancel()
            this.cancellationRequest = null
            this.emit("abort", "Aborted previous cancellation request")
        }

        // Cancel the import on the backend (if started)
        if (this.statusLocation) {
            await wait(100)
            const answer = await ask("Do you want to cancel and remove the import job on the server (Y/n)?");
            process.stdout.write("\r\x1b[2K");
            if (answer.toLowerCase() === "n") {
                console.log("  -> Import job left to expire on the server")
                return;
            }

            if (!this.statusLocation) {
                console.log("  -> Import completed while waiting for your answer")
                return;
            }

            this.cancellationRequest = got(this.statusLocation, {
                method: "DELETE",
                headers: { accept: "application/json" },
                responseType: "json",
                context: {
                    verbose: this.verbose
                }
            })

            console.log("  -> Server asked to abort the import:")

            return this.cancellationRequest.then(res => {
                this.cancellationRequest = null
                if (res.body.resourceType === "OperationOutcome") {
                    const o: fhir4.OperationOutcome = res.body
                    console.log("  -> " + o.issue.map(i => `${i.code} ${i.severity}: ${i.diagnostics || i.details?.text || "Unknown error"}`).join("\n  -> "))
                } else {
                    console.log("  -> ", res.body)
                }
                if (res.statusCode < 200 || res.statusCode >= 400) {
                    console.log("  -> Cancellation request failed")
                }
            }).catch(e => {
                this.cancellationRequest = null
                if (!(e instanceof AbortError)) {
                    this.onError(e)
                }
            })
        }
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

        this.kickOffRequest = got(config.consumerKickOffEndpoint, {
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
            this.kickOffRequest = null
            if (res.statusCode === 202) {
                const loc = res.headers["content-location"];
                if (loc) {
                    this.statusLocation = loc;
                    this.emit("kickOffComplete", res)
                    return this.waitForImport()
                }
            }
            this.emit("error", errorFromResponse(res));
            return res;
        })
        .catch(e => this.onError(e))
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
    private async waitForImport(prevProgress?: number): Promise<any>
    {
        this.statusRequest = got(this.statusLocation, {
            headers: { accept: "application/json" },
            responseType: "json",
            context: {
                verbose: this.verbose
            }
        })
        
        return this.statusRequest.then(async (res) => {
            this.statusRequest = null
            if (res.statusCode === 202) {
                const progress = Math.round(parseFloat(String(res.headers["x-progress"] || "0")));
                if (progress !== prevProgress) {
                    // NOTE: The x-status header is not part of the spec!
                    const status = String(res.headers["x-status"] || "Please wait...");
                    this.emit("progress", { value: progress, message: status });
                }
                await wait(config.statusPoolFrequency, this.abortController.signal);
                return this.waitForImport(progress);
            }
            else if (res.statusCode === 200) {
                this.statusLocation = null
                this.emit("progress", { value: 100, message: "Import completed" });
                this.emit("importComplete", res)
            }
            return res
        })
        .catch(e => this.onError(e))
    }
}
