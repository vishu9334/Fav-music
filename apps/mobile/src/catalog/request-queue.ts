/** Bound catalog traffic without polling or dropping another screen's request. */
export class RequestQueue {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  public constructor(private readonly concurrency = 2, private readonly capacity = 16) {}

  public run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.active >= this.concurrency && this.waiting.length >= this.capacity) {
      return Promise.reject(new Error('Catalog requests are busy. Please retry.'));
    }
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active++;
        void Promise.resolve().then(() => {
          if (signal?.aborted) throw Object.assign(new Error('Request cancelled.'), { name: 'AbortError' });
          return operation();
        }).then(resolve, reject).finally(() => {
          this.active--;
          this.waiting.shift()?.();
        });
      };
      if (this.active < this.concurrency) start();
      else this.waiting.push(start);
    });
  }
}
