declare module 'parse-curl' {
    interface ParsedCurl {
        url: string;
        method: string;
        header: Record<string, string>;
        body: any;
    }
    function parseCurl(command: string): ParsedCurl;
    export = parseCurl;
}
