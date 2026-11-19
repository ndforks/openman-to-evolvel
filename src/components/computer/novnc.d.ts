/** Minimal types for the parts of noVNC's RFB client this app uses. The package ships no declarations. */
declare module "@novnc/novnc" {
  export interface RFBCredentials {
    username?: string;
    password?: string;
    target?: string;
  }

  export interface RFBOptions {
    shared?: boolean;
    credentials?: RFBCredentials;
    repeaterID?: string;
    wsProtocols?: string[];
  }

  export interface RFBEventMap {
    connect: CustomEvent<Record<string, never>>;
    disconnect: CustomEvent<{ clean: boolean }>;
    credentialsrequired: CustomEvent<{ types: string[] }>;
    securityfailure: CustomEvent<{ status: number; reason?: string }>;
    desktopname: CustomEvent<{ name: string }>;
    clipboard: CustomEvent<{ text: string }>;
    bell: CustomEvent<Record<string, never>>;
    capabilities: CustomEvent<{ capabilities: { power: boolean } }>;
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string | WebSocket | RTCDataChannel, options?: RFBOptions);

    viewOnly: boolean;
    focusOnClick: boolean;
    clipViewport: boolean;
    dragViewport: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    showDotCursor: boolean;
    background: string;
    qualityLevel: number;
    compressionLevel: number;
    readonly capabilities: { power: boolean };

    disconnect(): void;
    sendCredentials(credentials: RFBCredentials): void;
    sendKey(keysym: number, code: string | null, down?: boolean): void;
    sendCtrlAltDel(): void;
    focus(options?: FocusOptions): void;
    blur(): void;
    clipboardPasteFrom(text: string): void;

    addEventListener<K extends keyof RFBEventMap>(type: K, listener: (event: RFBEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof RFBEventMap>(type: K, listener: (event: RFBEventMap[K]) => void, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void;
  }
}
