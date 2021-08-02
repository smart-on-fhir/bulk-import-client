import got from "got/dist/source"


export default got.extend({
    hooks: {
        beforeRequest: [
            options => {
                if (options.context.verbose) {
                    console.log(`\n-----------------------------------------------------`)
                    console.log(`Request: ${options.method} ${options.url}`)
                    console.log(`Headers:`, options.headers)

                    const payload = options.body || options.form || options.json
                    if (payload) {
                        console.log("Payload:", payload)
                    }
                }
            }
        ],
        afterResponse: [
            response => {
                if (response.request.options.context.verbose) {
                    console.log(`Response Headers:`, response.headers)
                    if (response.body) {
                        console.log(`Response:`, response.body)
                    }
                    console.log(`-----------------------------------------------------\n`)
                }
                return response
            }
        ],
        beforeError: [
            error => {
                const { response } = error;
                
                if (typeof response?.body == "object") {
                    
                    // @ts-ignore OperationOutcome errors
                    if (response.body.resourceType === "OperationOutcome") {
                        const oo = response.body as fhir4.OperationOutcome
                        // @ts-ignore
                        error.severity = oo.issue[0].severity;
                        error.message = oo.issue[0].details?.text || oo.issue[0].diagnostics || response.statusMessage || "Unknown error"
                        error.code = oo.issue[0].code || response.statusCode + ""
                    }

                    // @ts-ignore OAuth errors
                    else if (response.body.error) {
                        // @ts-ignore
                        error.message = [response.body.error, response.body.error_description].filter(Boolean).join(": ")
                        error.code = response.statusCode + ""
                    }
                }

                return error;
            }
        ]
    }
});
