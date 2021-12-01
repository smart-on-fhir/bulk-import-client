import "colors"
import got, { Response } from "got/dist/source";
import { ImportClient } from "..";
import { CustomError } from "./CustomError";
import { NDJSONStream } from "./NDJSONStream";

export class AbortError extends Error {
    constructor(message = "Operation aborted") {
        super(message)
    }
}

/**
 * Simple utility for waiting. Returns a promise that will resolve after @ms
 * milliseconds.
 */
export function wait(ms: number, signal?: AbortSignal)
{
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            if (signal) {
                signal.removeEventListener("abort", abort);
            }
            resolve(true)
        }, ms);

        function abort() {
            if (timer) {
                clearTimeout(timer);
            }
            reject(new AbortError("Waiting aborted"))
        }

        if (signal) {
            signal.addEventListener("abort", abort);
        }
    });
}

/**
 * Generates a progress indicator
 */
export function progressBar(pct = 0, length = 40)
{
    pct = parseFloat(pct + "" || "0");

    if (isNaN(pct) || !isFinite(pct)) {
        pct = 0;
    }

    let spinner = "", bold = [], grey = [];

    for (let i = 0; i < length; i++) {
        if (i / length * 100 >= pct) {
            grey.push("▉");
        }
        else {
            bold.push("▉");
        }
    }

    if (bold.length) {
        spinner += bold.join("").bold;
    }

    if (grey.length) {
        spinner += grey.join("").grey;
    }

    let prefix = String(pct)
    if (pct < 10) prefix = "  " + prefix;
    else if (pct < 100) prefix = " " + prefix;

    return "\r\033[2K" + `${prefix}% `.bold + `${spinner} `;
}

export function ask(question: string): Promise<string>
{
    return new Promise(resolve => {
        process.stdout.write(`${question} `);
        process.stdin.once("data", data => {
            resolve(String(data).trim());
        });
    });
}

export async function parseImportResult(result: ImportClient.ImportResult): Promise<ImportClient.AggregatedImportResult>
{
    return new Promise((resolve, reject) => {
        const outcomes = {
            fatal: [],
            error: [],
            warning: [],
            information: []
        };

        if (!result.outcome.length) {
            return resolve(outcomes)
        }

        let jobs = 0;

        function onComplete() {
            jobs -= 1
            if (jobs === 0) {
                resolve(outcomes)
            }
        }

        for (const entry of result.outcome) {

            jobs += 1;

            const parser = new NDJSONStream();
            
            parser.once("end", onComplete)
            parser.once("error", reject)

            parser.on("data", json => {
                const severity = json.issue?.[0]?.severity as keyof typeof outcomes;
                outcomes[severity || "information"].push(json.issue[0]);
            })

            got.stream(entry.url).pipe(parser)
        }
    })
}

export function errorFromResponse(res: Response)
{
    if (typeof res.body === "object") {
        return errorFromOperationOutcome(res.body as fhir4.OperationOutcome)
    }
    return new CustomError(res.statusCode, res.body as string || res.statusMessage || "Unknown error")
}

export function errorFromOperationOutcome(outcome: fhir4.OperationOutcome)
{
    const issue = outcome.issue[0]
    return new CustomError(issue.code, issue.diagnostics, issue.severity)
}

export function asArray(x: any): any[] {
    return Array.isArray(x) ? x : [x]
}