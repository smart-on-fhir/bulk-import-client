import commander, { Command } from "commander"
import { CancelError }        from "got/dist/source"
import { inspect }            from "util"
import { Client }             from "./client"
import {
    progressBar,
    parseImportResult,
    ask,
    AbortError
} from "./lib"


const app = new Command()

app.name("bdi")
app.version("1.0.0")

app.addOption(
    new commander.Option("-t, --import-type [type]", "Bulk Data Import type.")
        .choices(["static", "dynamic"])
        .default("dynamic")
)

app.option(
    "-e, --export-url <url>",
    "The export kickOff URL for dynamic exports, or the location of an " +
    "export  manifest file for static exports"
)

app.option("-v, --verbose", "Log requests and other details", false)

app.option("--type [_type]"          , 'The "_type" option for bulk data exports'        ) 
app.option("--since [_since]"        , 'The "_since" option for bulk data exports'       )
app.option("--format [_outputFormat]", 'The "_outputFormat" option for bulk data exports')
app.option("--elements [_elements]"  , 'The "_elements" option for bulk data exports'    )
app.option("--patient [patient]"     , 'The "patient" option for bulk data exports'      )

app.action(async (args) => {
    const {
        exportUrl,
        importType,
        verbose,
        type,
        since,
        format,
        elements,
        patient
    } = args

    if (!exportUrl) {
        return app.help()
    }

    const client = new Client(verbose);

    client.on("error", e => {
        console.log("")
        if (e instanceof AbortError || e instanceof CancelError) {
            console.log(e.message)
        } else {
            console.log("Error", inspect(e, { colors: true }))
        }
    })

    client.on("abort", console.log)

    client.once("kickOffStart", () => {
        process.stdout.write("\r\033[2KKickOff request started")
    })

    client.once("kickOffComplete", () => {
        process.stdout.write("\r\033[2KKickOff request completed")
    })

    client.on("progress", ({ value, message }) => {
        process.stdout.write(progressBar(value) + ` ${message}`)
    })

    client.once("importComplete", async (res) => {
        const result      = await parseImportResult(res.body)
        const fatal       = result.fatal.length
        const error       = result.error.length
        const warning     = result.warning.length
        const information = result.information.length
        
        if (fatal + error + warning + information) {
            process.stdout.write(
                "\r\033[2KImport completed with the following outcomes:\n" +
                "      fatal: ".red.bold + fatal       + "\n" +
                "      error: ".red      + error       + "\n" +
                "    warning: ".yellow   + warning     + "\n" +
                "information: ".cyan     + information + "\n\n"
            )

            const answer = await ask("Do you want to see more details (y/n)?");
            process.stdout.write("\r\033[2K");
            if (answer.toLowerCase() === "y") {
                for (const severity in result) {
                    if (result[severity].length) {
                        console.log("\n" + severity.toUpperCase() + " outcomes:")
                        console.log("======================================================================")
                        for (const entry of result[severity]) {
                            console.log(String(" " + entry.code + " ").bgWhite.black + " " + entry.diagnostics)
                        }
                    }
                }
            }
        } else {
            process.stdout.write("\r\033[2KImport completed (without any outcomes returned)\n")
        }

        process.exit(0);
    })

    const job = client.kickOff({
        exportUrl,
        importType,
        patient,
        _type        : type,
        _since       : since,
        _elements    : elements,
        _outputFormat: format,
    })

    process.on("SIGINT", () => {
        console.log("");
        client.cancel().then(() => {
            process.exit(0)
        })
    });

    await job;
})

async function main() {
    await app.parseAsync(process.argv);
}

main()

