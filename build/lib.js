var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.asArray = exports.errorFromOperationOutcome = exports.errorFromResponse = exports.parseImportResult = exports.ask = exports.progressBar = exports.wait = exports.AbortError = void 0;
require("colors");
const source_1 = __importDefault(require("got/dist/source"));
const CustomError_1 = require("./CustomError");
const NDJSONStream_1 = require("./NDJSONStream");
class AbortError extends Error {
    constructor(message = "Operation aborted") {
        super(message);
    }
}
exports.AbortError = AbortError;
/**
 * Simple utility for waiting. Returns a promise that will resolve after @ms
 * milliseconds.
 */
function wait(ms, signal) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            if (signal) {
                signal.removeEventListener("abort", abort);
            }
            resolve(true);
        }, ms);
        function abort() {
            if (timer) {
                clearTimeout(timer);
            }
            reject(new AbortError("Waiting aborted"));
        }
        if (signal) {
            signal.addEventListener("abort", abort);
        }
    });
}
exports.wait = wait;
/**
 * Generates a progress indicator
 */
function progressBar(pct = 0, length = 40) {
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
    let prefix = String(pct);
    if (pct < 10)
        prefix = "  " + prefix;
    else if (pct < 100)
        prefix = " " + prefix;
    return "\r\033[2K" + `${prefix}% `.bold + `${spinner} `;
}
exports.progressBar = progressBar;
function ask(question) {
    return new Promise(resolve => {
        process.stdout.write(`${question} `);
        process.stdin.once("data", data => {
            resolve(String(data).trim());
        });
    });
}
exports.ask = ask;
async function parseImportResult(result) {
    return new Promise((resolve, reject) => {
        const outcomes = {
            fatal: [],
            error: [],
            warning: [],
            information: []
        };
        if (!result.outcome.length) {
            return resolve(outcomes);
        }
        let jobs = 0;
        function onComplete() {
            jobs -= 1;
            if (jobs === 0) {
                resolve(outcomes);
            }
        }
        for (const entry of result.outcome) {
            jobs += 1;
            const parser = new NDJSONStream_1.NDJSONStream();
            parser.once("end", onComplete);
            parser.once("error", reject);
            parser.on("data", json => {
                const severity = json.issue?.[0]?.severity;
                outcomes[severity || "information"].push(json.issue[0]);
            });
            source_1.default.stream(entry.url).pipe(parser);
        }
    });
}
exports.parseImportResult = parseImportResult;
function errorFromResponse(res) {
    if (typeof res.body === "object") {
        return errorFromOperationOutcome(res.body);
    }
    return new CustomError_1.CustomError(res.statusCode, res.body || res.statusMessage || "Unknown error");
}
exports.errorFromResponse = errorFromResponse;
function errorFromOperationOutcome(outcome) {
    const issue = outcome.issue[0];
    return new CustomError_1.CustomError(issue.code, issue.diagnostics, issue.severity);
}
exports.errorFromOperationOutcome = errorFromOperationOutcome;
function asArray(x) {
    return Array.isArray(x) ? x : [x];
}
exports.asArray = asArray;
