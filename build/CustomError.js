Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomError = void 0;
class CustomError extends Error {
    constructor(status, message, severity = "error") {
        super(message);
        this.status = status;
        this.severity = severity;
    }
    toJSON() {
        return {
            message: this.message,
            status: this.status,
            severity: this.severity
        };
    }
}
exports.CustomError = CustomError;
