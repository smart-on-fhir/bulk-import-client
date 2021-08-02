var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = __importStar(require("commander"));
const util_1 = require("util");
const client_1 = require("./client");
const lib_1 = require("./lib");
const app = new commander_1.Command();
app.name("bdi");
app.version("1.0.0");
app.addOption(new commander_1.default.Option("-t, --import-type [type]", "Bulk Data Import type.")
    .choices(["static", "dynamic"])
    .default("dynamic"));
app.option("-e, --export-url <url>", "The export kickOff URL for dynamic exports, or the location of an " +
    "export  manifest file for static exports");
app.option("-v, --verbose", "Log requests and other details", false);
app.option("--type [_type]", 'The "_type" option for bulk data exports');
app.option("--since [_since]", 'The "_since" option for bulk data exports');
app.option("--format [_outputFormat]", 'The "_outputFormat" option for bulk data exports');
app.option("--elements [_elements]", 'The "_elements" option for bulk data exports');
app.option("--patient [patient]", 'The "patient" option for bulk data exports');
app.action(async (args) => {
    const { exportUrl, importType, verbose, type, since, format, elements, patient } = args;
    if (!exportUrl) {
        return app.help();
    }
    const client = new client_1.Client(verbose);
    client.on("error", e => {
        console.log("");
        console.log("Error", util_1.inspect(e, { colors: true }));
    });
    client.once("kickOffStart", () => {
        process.stdout.write("\r\033[2KKickOff request started");
    });
    client.once("kickOffComplete", () => {
        process.stdout.write("\r\033[2KKickOff request completed");
    });
    client.on("progress", ({ value, message }) => {
        process.stdout.write(lib_1.progressBar(value) + ` ${message}`);
    });
    client.once("importComplete", async (res) => {
        const result = await lib_1.parseImportResult(res.body);
        if (result.fatal.length + result.error.length + result.warning.length + result.information.length > 0) {
            process.stdout.write("\r\033[2KImport completed with the following outcomes:\n" +
                "      fatal: ".red.bold + result.fatal.length + "\n" +
                "      error: ".red + result.error.length + "\n" +
                "    warning: ".yellow + result.warning.length + "\n" +
                "information: ".cyan + result.information.length + "\n\n");
            const answer = await lib_1.ask("Do you want to see more details (y/n)?");
            process.stdout.write("\r\033[2K");
            if (answer.toLowerCase() === "y") {
                for (const severity in result) {
                    if (result[severity].length) {
                        console.log("\n" + severity.toUpperCase() + " outcomes:");
                        console.log("======================================================================");
                        for (const entry of result[severity]) {
                            console.log(String(" " + entry.code + " ").bgWhite.black + " " + entry.diagnostics);
                        }
                    }
                }
            }
        }
        else {
            process.stdout.write("\r\033[2KImport completed (without any outcomes returned)\n");
        }
        process.exit(0);
    });
    await client.kickOff({
        exportUrl,
        importType,
        patient,
        _type: type,
        _since: since,
        _elements: elements,
        _outputFormat: format,
    });
});
async function main() {
    await app.parseAsync(process.argv);
}
main();
