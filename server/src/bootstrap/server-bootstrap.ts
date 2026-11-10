import { ILifecycleComponent } from '../index.js';

export interface IServerBootstrapDependencies {
  readonly createApplication: () => ILifecycleComponent;
  readonly log: (message: string) => void;
}

/** Executable lifecycle coordinator. Importing the application library never starts it. */
export class ServerBootstrap {
  private application?: ILifecycleComponent;
  private starting: Promise<void> | null = null;
  private stopping: Promise<void> | null = null;

  public constructor(private readonly dependencies: IServerBootstrapDependencies) {}

  public start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = this.startApplication();
    return this.starting;
  }

  public stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = this.stopApplication();
    return this.stopping;
  }

  private async startApplication(): Promise<void> {
    this.application = this.dependencies.createApplication();
    try {
      await this.application.start();
      this.dependencies.log('[Startup] Aadat Music API is listening.');
    } catch (error) {
      await this.application.stop().catch(() => {});
      throw error;
    }
  }

  private async stopApplication(): Promise<void> {
    if (this.starting) await this.starting.catch(() => {});
    await this.application?.stop();
    this.dependencies.log('[Shutdown] Aadat Music API stopped.');
  }
}
