/**
 * Scheduler
 * =========
 * A few useful timing utilities.
 */
class Scheduler {
  private rafPids: { [key: string]: number } = {};
  private throttleTimes: { [key: string]: number } = {};
  private throttlePids: { [key: string]: NodeJS.Timeout } = {};
  private debouncePids: { [key: string]: NodeJS.Timeout } = {};

  /**
   * Run the callback function in the next animation frame. Only the most recent invocation's
   * callback function (grouped by key) is called.
   * @param key used to group invocations.
   * @param fn the callback function.
   */
  nextFrame(key: string, fn: () => void): void {
    const pid = this.rafPids[key];
    if (pid) {
      cancelAnimationFrame(pid);
      delete this.rafPids[key];
    }
    this.rafPids[key] = requestAnimationFrame(fn);
  }

  /**
   * Ensure the callback function does not get called more frequently than the specified interval.
   * @param key used to group invocations.
   * @param interval minimum time interval (ms) between callback function calls.
   * @param fn the callback function.
   */
  throttle(key: string, interval: number, fn: () => void): void {
    const now = performance.now();
    const pid = this.throttlePids[key];
    if (pid) {
      clearTimeout(pid);
      delete this.throttlePids[key];
    }

    const runTime = (this.throttleTimes[key] || 0) + interval;
    if (now > runTime) {
      fn();
      this.throttleTimes[key] = now;
    } else {
      this.throttlePids[key] = setTimeout(fn, interval);
    }
  }

  /**
   * Ensure the callback function only gets called after a pause in invocations greater than interval.
   * @param key used to group invocations.
   * @param interval minimum pause interval (ms) before a callback function is called.
   * @param fn the callback function.
   */
  debounce(key: string, interval: number, fn: () => void): void {
    const pid = this.debouncePids[key];
    if (pid) {
      clearTimeout(pid);
      delete this.debouncePids[key];
    }
    this.debouncePids[key] = setTimeout(fn, interval);
  }
}

export default Scheduler;
