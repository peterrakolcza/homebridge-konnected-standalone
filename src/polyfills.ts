/**
 * esphome-client calls Promise.try (command confirmation, auto-reconnect), which Node 22 does not have. Install a spec-equivalent
 * version when it is missing so the plugin works on every Node version Homebridge supports.
 */
export type PromiseTry = <T, A extends unknown[]>(fn: (...args: A) => T | PromiseLike<T>, ...args: A) => Promise<Awaited<T>>;

export function installPromiseTry(target: PromiseConstructor = Promise): void {
  const ctor = target as PromiseConstructor & { try?: PromiseTry };
  if (typeof ctor.try === 'function') {
    return;
  }
  const promiseTry: PromiseTry = function <T, A extends unknown[]>(this: unknown, fn: (...args: A) => T | PromiseLike<T>, ...args: A) {
    const C = (typeof this === 'function' ? this : target) as PromiseConstructor;
    return new C<Awaited<T>>((resolve) => resolve(fn(...args) as Awaited<T>));
  };
  Object.defineProperty(ctor, 'try', { value: promiseTry, configurable: true, writable: true, enumerable: false });
}

installPromiseTry();
