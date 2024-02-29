import React, { useEffect } from "react";

export class Store<T, U> {
  private state: T;
  private listeners: Set<() => void> = new Set();

  constructor(
    init: [T, ((state: T) => Promise<U | undefined>)?],
    private produceNextState: (state: T, action: U) => T,
    private runEffectAndProduceNextAction: (
      state: T,
      action: U,
    ) => Promise<U | undefined> = async () => undefined,
  ) {
    const [initialState, initialEffect] = init;
    this.state = initialState;
    if (!initialEffect) {
      return;
    }
    initialEffect(initialState)
      .then((msg) => {
        if (msg) {
          this.dispatch(msg);
        }
      })
      .catch((e) => {
        console.error(e);
      });
  }

  getModel(): T {
    return this.state;
  }

  dispatch(action: U): void {
    const nextState = this.produceNextState(this.state, action);
    this.state = nextState;
    this.runEffectAndProduceNextAction(nextState, action)
      .then((nextMsg) => {
        if (nextMsg) {
          this.dispatch(nextMsg);
        }
      })
      .catch((e) => {
        console.error(e);
      });
    this.notifySubscribersOfStateChange();
  }

  subscribeToStateChanges(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifySubscribersOfStateChange(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export abstract class StoreHelper<T, U> {
  store: Store<T, U>;

  constructor() {
    this.store = new Store(
      [this.provideDefaultState(), this.runInitialEffect],
      this.produceNextState,
      this.runEffectAndProduceNextAction,
    );
  }

  abstract provideDefaultState(): T;

  abstract produceNextState(model: T, msg: U): T;

  async runInitialEffect(_model: T): Promise<U | undefined> {
    return undefined;
  }

  async runEffectAndProduceNextAction(
    _model: T,
    _msg: U,
  ): Promise<U | undefined> {
    return undefined;
  }
}

export class ComponentStore<T, U> {
  private Context = React.createContext<Store<T, U> | undefined>(undefined);
  constructor(private createStore: () => Store<T, U>) {}

  Provider({
    onRerender,
    children,
  }: {
    onRerender?: (model: T) => U;
    children?: React.ReactNode;
  }) {
    const storeRef = React.useRef<Store<T, U>>();
    if (!storeRef.current) {
      storeRef.current = this.createStore();
    }

    // This SHOULD happen after every render.
    // That is why there is no dependency array.
    useEffect(() => {
      const nextMsg = onRerender?.(storeRef.current!!.getModel());
      if (nextMsg) {
        storeRef.current!!.dispatch(nextMsg);
      }
    });

    return React.createElement(
      this.Context.Provider,
      { value: storeRef.current },
      children,
    );
  }

  useSelector<V>(selector: (model: T) => V): V {
    const store = React.useContext(this.Context);
    if (!store) {
      throw new Error("ComponentStore.Provider not found");
    }
    return React.useSyncExternalStore(
      store.subscribeToStateChanges.bind(store),
      () => selector(store.getModel()),
    );
  }

  useDispatch(): (msg: U) => void {
    const store = React.useContext(this.Context);
    if (!store) {
      throw new Error("ComponentStore.Provider not found");
    }
    return store.dispatch.bind(store);
  }
}

export abstract class ComponentStoreHelper<T, U> {
  Provider: ComponentStore<T, U>["Provider"];
  useSelector: ComponentStore<T, U>["useSelector"];
  useDispatch: ComponentStore<T, U>["useDispatch"];

  constructor() {
    const store = new ComponentStore(() => {
      return new Store(
        [this.provideDefaultState(), this.runInitialEffect],
        this.produceNextState,
        this.runEffectAndProduceNextAction,
      );
    });
    this.Provider = store.Provider.bind(store);
    this.useSelector = store.useSelector.bind(store);
    this.useDispatch = store.useDispatch.bind(store);
  }

  abstract provideDefaultState(): T;

  abstract produceNextState(model: T, msg: U): T;

  async runInitialEffect(_model: T): Promise<U | undefined> {
    return undefined;
  }

  async runEffectAndProduceNextAction(
    _model: T,
    _msg: U,
  ): Promise<U | undefined> {
    return undefined;
  }
}
