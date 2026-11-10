/** Capture when a dialog/task is created, not when its eventual callback fires. */
export class CollectionScopeGuard {
  private readonly version: number;
  public constructor(private readonly current: () => { scopeVersion: number; status: string }) {
    this.version = current().scopeVersion;
  }
  public valid(): boolean { const value = this.current(); return value.scopeVersion === this.version && value.status === 'ready'; }
  public async run<T>(action: () => Promise<T>): Promise<T | undefined> { if (!this.valid()) return undefined; const result = await action(); return this.valid() ? result : undefined; }
}
