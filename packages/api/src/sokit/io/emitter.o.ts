type Callback = (...args: any[]) => void;

/**
 * An events map is an interface that maps event names to their value, which
 * represents the type of the `on` listener.
 */
export interface EventsMap {
    [event: string]: any;
}
/**
 * Returns a union type containing all the keys of an event map.
 */
export type EventNames<Map extends EventsMap> = keyof Map & (string | symbol);

/** The tuple type representing the parameters of an event listener */
export type EventParams<
    Map extends EventsMap,
    Ev extends EventNames<Map>
    > = Parameters<Map[Ev]>;

/**
 * The event names that are either in ReservedEvents or in UserEvents
 */
export type ReservedOrUserEventNames<
    ReservedEventsMap extends EventsMap,
    UserEvents extends EventsMap
    > = EventNames<ReservedEventsMap> | EventNames<UserEvents>;

/**
 * Type of a listener of a user event or a reserved event. If `Ev` is in
 * `ReservedEvents`, the reserved event listener is returned.
 */
export type ReservedOrUserListener<
    ReservedEvents extends EventsMap,
    UserEvents extends EventsMap,
    Ev extends ReservedOrUserEventNames<ReservedEvents, UserEvents>
    > = FallbackToUntypedListener<
    Ev extends EventNames<ReservedEvents>
        ? ReservedEvents[Ev]
        : Ev extends EventNames<UserEvents>
        ? UserEvents[Ev]
        : never
    >;

/**
 * Returns an untyped listener type if `T` is `never`; otherwise, returns `T`.
 *
 * This is a hack to mitigate https://github.com/socketio/socket.io/issues/3833.
 * Needed because of https://github.com/microsoft/TypeScript/issues/41778
 */
type FallbackToUntypedListener<T> = [T] extends [never]
    ? (...args: any[]) => void | Promise<void>
    : T;


/**
 * 将原本基于函数的 Emitter 改写为基于 Class 的 Emitter。
 * 这种写法在现代 TypeScript 中更易读、更符合面向对象习惯。
 */
export class Emitter<
    ListenEvents extends EventsMap,
    EmitEvents extends EventsMap,
    ReservedEvents extends EventsMap = {}
    > {
  private _callbacks: Map<string | symbol, Callback[]> = new Map();

  constructor(obj?: any) {
    if (obj) {
      return this.mixin(obj);
    }
  }

  /**
   * 将 Emitter 的属性混入到目标对象中（兼容原版用法）
   */
  private mixin(obj: any): any {
    for (const key in Emitter.prototype) {
      if (typeof (this as any)[key] === 'function') {
        obj[key] = (this as any)[key].bind(this);
      }
    }
    return obj;
  }

  private getEventKey = (event: string | symbol): string | symbol => typeof event === 'symbol' ? event : '$' + (event as string)

  /**
   * 监听事件
   */
  on<Ev extends ReservedOrUserEventNames<ReservedEvents, ListenEvents>>(
    event: Ev, 
    listener: ReservedOrUserListener<ReservedEvents, ListenEvents, Ev>): this {
    const key = this.getEventKey(event);
    let callbacks = this._callbacks.get(key);
    if (!callbacks) {
      callbacks = [];
      this._callbacks.set(key, callbacks);
    }
    callbacks.push(listener);
    return this;
  }

  addEventListener<Ev extends ReservedOrUserEventNames<ReservedEvents, ListenEvents>>(
    event: Ev, 
    listener: ReservedOrUserListener<ReservedEvents, ListenEvents, Ev>): this {
    return this.on(event, listener);
  }

  /**
   * 监听一次性事件
   */
  once<Ev extends ReservedOrUserEventNames<ReservedEvents, ListenEvents>>(
    event: Ev, 
    listener: ReservedOrUserListener<ReservedEvents, ListenEvents, Ev>): this {
    const on = (...args: any[]) => {
      this.off(event, on as any);
      listener.apply(this, args);
    };
    (on as any).fn = listener;
    this.on(event, on as any);
    return this;
  }

  /**
   * 移除监听器
   */
  off<Ev extends ReservedOrUserEventNames<ReservedEvents, ListenEvents>>(
    event?: Ev, 
    listener?: ReservedOrUserListener<ReservedEvents, ListenEvents, Ev>): this {
    
    // 移除所有
    if (arguments.length === 0) {
      this._callbacks.clear();
      return this;
    }

    // 移除特定事件的所有监听器
    const key = this.getEventKey(event!);
    const callbacks = this._callbacks.get(key);
    if (!callbacks) return this;

    if (arguments.length === 1) {
      this._callbacks.delete(key);
      return this;
    }

    // 移除特定监听器
    for (let i = 0; i < callbacks.length; i++) {
      const cb = callbacks[i];
      if (cb === listener || (cb as any).fn === listener) {
        callbacks.splice(i, 1);
        break;
      }
    }

    if (callbacks.length === 0) {
      this._callbacks.delete(key);
    }

    return this;
  }

  removeListener<Ev extends ReservedOrUserEventNames<ReservedEvents, ListenEvents>>(
    event?: Ev, 
    listener?: ReservedOrUserListener<ReservedEvents, ListenEvents, Ev>): this {
    return this.off(event, listener);
  }

  removeAllListeners<Ev extends ReservedOrUserEventNames<ReservedEvents, ListenEvents>>(
    event?: Ev, 
    listener?: ReservedOrUserListener<ReservedEvents, ListenEvents, Ev>): this {
    return this.off(event, listener);
  }

  removeEventListener<Ev extends ReservedOrUserEventNames<ReservedEvents, ListenEvents>>(
    event?: Ev, 
    listener?: ReservedOrUserListener<ReservedEvents, ListenEvents, Ev>): this {
    return this.off(event, listener);
  }

  /**
   * 触发事件
   */
  emit<Ev extends EventNames<EmitEvents>>(
    event: Ev, 
    ...args: EventParams<EmitEvents, Ev>): this {
    const key = this.getEventKey(event);
    let callbacks = this._callbacks.get(key);

    if (callbacks) {
      callbacks = callbacks.slice(0);
      for (let i = 0; i < callbacks.length; i++) {
        callbacks[i].apply(this, args);
      }
    }

    return this;
  }

  /**
   * 触发保留事件（受保护方法别名）
   */
  emitReserved<Ev extends EventNames<ReservedEvents>>(
    event: Ev, 
    ...args: EventParams<ReservedEvents, Ev>): this {
    const key = this.getEventKey(event);
    let callbacks = this._callbacks.get(key);

    if (callbacks) {
      callbacks = callbacks.slice(0);
      for (let i = 0; i < callbacks.length; i++) {
        callbacks[i].apply(this, args);
      }
    }

    return this;
  }

  /**
   * 获取特定事件的所有监听器
   */
  listeners<Ev extends ReservedOrUserEventNames<ReservedEvents, ListenEvents>>(
    event: Ev): ReservedOrUserListener<ReservedEvents, ListenEvents, Ev>[] {
    const key = this.getEventKey(event);
    return (this._callbacks.get(key) || []) as any;
  }

  /**
   * 检查是否有特定事件的监听器
   */
  hasListeners<Ev extends ReservedOrUserEventNames<ReservedEvents, ListenEvents>>(
    event: Ev): boolean {
    return this.listeners(event).length > 0;
  }
}
