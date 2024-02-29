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
      .then((action) => {
        if (action) {
          this.dispatch(action);
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

  abstract produceNextState(state: T, action: U): T;

  async runInitialEffect(_state: T): Promise<U | undefined> {
    return undefined;
  }

  async runEffectAndProduceNextAction(
    _state: T,
    _action: U,
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
    onRerender?: (state: T) => U;
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

  useSelector<V>(selector: (state: T) => V): V {
    const store = React.useContext(this.Context);
    if (!store) {
      throw new Error("ComponentStore.Provider not found");
    }
    return React.useSyncExternalStore(
      store.subscribeToStateChanges.bind(store),
      () => selector(store.getModel()),
    );
  }

  useDispatch(): (action: U) => void {
    const store = React.useContext(this.Context);
    if (!store) {
      throw new Error("ComponentStore.Provider not found");
    }
    return store.dispatch.bind(store);
  }
}

/**
 * A helper class for creating a `ComponentStore`.
 *
 * This class is meant to be implemented by anonymous classes that override its
 * abstract methods.
 *
 * The `ComponentStore` class is a wrapper around the `Store` class that
 * provides a React context and hooks for using the store in a React
 * application.
 *
 * @template T The type of the store's state.
 * @template U The type of the store's actions.
 *
 * @returns An object with three properties:
 * - `Provider`: A React component that provides the store to its children.
 * - `useSelector`: A hook for selecting a value from the store's state.
 * - `useDispatch`: A hook for dispatching an action to the store.
 */
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

  /**
   * Provides the default/initial state of the store.
   */
  abstract provideDefaultState(): T;

  /**
   * Produces the next state of the store given the current state and an
   * action.
   * @param state
   * @param action
   */
  abstract produceNextState(state: T, action: U): T;

  /**
   * Runs a side effect when the store is created, returning an action to be
   * dispatched to the store on-completion.
   *
   * Overriding this method is optional.
   * @param _state Initial state of the store.
   */
  async runInitialEffect(_state: T): Promise<U | undefined> {
    return undefined;
  }

  /**
   * Determines side effects to run when actions are dispatched to the store,
   * returning either another action to be dispatched to the store or nothing.
   *
   * Overriding this method is optional.
   * @param _state Current state of the store.
   * @param _action Message dispatched to the store.
   */
  async runEffectAndProduceNextAction(
    _state: T,
    _action: U,
  ): Promise<U | undefined> {
    return undefined;
  }
}
