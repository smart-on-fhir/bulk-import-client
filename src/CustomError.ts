
type ProblemSeverity = 'fatal' | 'error' | 'warning' | 'information'


export class CustomError extends Error
{
    /**
     * The HTTP status code for this message
     */
    status: number | string;

    severity: ProblemSeverity;

    constructor(status: number | string, message: string, severity: ProblemSeverity = "error") {
        super(message)
        this.status = status
        this.severity = severity
    }

    toJSON() {
        return {
            message : this.message,
            status  : this.status,
            severity: this.severity
        }
    }
}