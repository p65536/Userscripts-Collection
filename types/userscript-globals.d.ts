// Script-specific globals.d.ts files extend the GM APIs shared by all three scripts.
interface UserscriptGM {
    setValue(key: string, value: unknown): Promise<void>;
    getValue<T = unknown>(key: string, defaultValue?: T): Promise<T>;
    registerMenuCommand(caption: string, onClick: (event: MouseEvent | KeyboardEvent) => void): Promise<number | string>;
}

declare const GM: UserscriptGM;
