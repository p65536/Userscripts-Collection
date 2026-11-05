interface UserscriptGM {
    addValueChangeListener(key: string, listener: (name: string, oldValue: unknown, newValue: unknown, remote: boolean) => void): Promise<number>;
    removeValueChangeListener(listenerId: number): Promise<void>;
}
