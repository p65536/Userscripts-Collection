interface GMXMLHttpRequestResponse<T> {
    finalUrl: string;
    readyState: number;
    status: number;
    statusText: string;
    responseHeaders: string;
    response: T;
    responseText: string;
    responseXML: Document | null;
}

// Only request options used by this script are declared.
interface GMXMLHttpRequestDetails<T> {
    method?: 'GET' | 'HEAD';
    url: string;
    headers?: Record<string, string>;
    timeout?: number;
    onload?: (response: GMXMLHttpRequestResponse<T>) => void;
    onerror?: (response: GMXMLHttpRequestResponse<T>) => void;
    ontimeout?: (response: GMXMLHttpRequestResponse<T>) => void;
}

interface UserscriptGM {
    xmlHttpRequest(details: GMXMLHttpRequestDetails<ArrayBuffer> & { responseType: 'arraybuffer' }): Promise<GMXMLHttpRequestResponse<ArrayBuffer>> & { abort(): void };
    xmlHttpRequest(details: GMXMLHttpRequestDetails<string> & { responseType?: 'text' }): Promise<GMXMLHttpRequestResponse<string>> & { abort(): void };
    openInTab(url: string, options?: { active?: boolean; insert?: boolean | number }): Promise<{ close(): void; onclose?: () => void; closed: boolean }>;
}

type AppDisposableFn = () => void;
type AppDisposableObj = { dispose: () => void };
type AppDisconnectableObj = { disconnect: () => void };
type AppAbortableObj = { abort: () => void };
type AppDestructibleObj = { destroy: () => void };
type AppDisposable = AppDisposableFn | AppDisposableObj | AppDisconnectableObj | AppAbortableObj | AppDestructibleObj;
