import {
  createContext,
  createElement,
  FC,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';

//#region Vanilla (Global) Store Creator

/** A store that holds state and allows dispatching actions to update it. */
export class Store<T, U> {
  private state: T;
  private listeners: Set<() => void> = new Set();

  constructor(
    init: [T, ((state: T) => Promise<U | undefined>)?],
    private produceNextState: (state: T, action: U) => T,
    private runEffectAndProduceNextAction: (
      state: T,
      action: U
    ) => Promise<U | undefined> = async () => undefined
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

  /** Returns the current state of the store. */
  getModel(): T {
    return this.state;
  }

  /** Dispatches an action to the store, updating its state. */
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

  /** Subscribes a listener to state changes in the store. */
  subscribeToStateChanges(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Notifies all subscribers of a state change. */
  private notifySubscribersOfStateChange(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export abstract class StoreHelper<T, U> {
  store: Store<T, U>;

  protected constructor() {
    this.store = new Store(
      [this.provideDefaultState(), this.runInitialEffect],
      this.produceNextState,
      this.runEffectAndProduceNextAction
    );
  }

  /** Provides the default/initial state of the store. */
  abstract provideDefaultState(): T;

  /**
   * Produces the next state of the store given the current state and an
   * action
   */
  abstract produceNextState(state: T, action: U): T;

  /**
   * Runs a side effect when the store is created, returning an action to be
   * dispatched to the store on-completion
   */
  async runInitialEffect(state: T): Promise<U | undefined> {
    return undefined;
  }

  /**
   * Determines side effects to run when actions are dispatched to the store
   */
  async runEffectAndProduceNextAction(
    state: T,
    action: U
  ): Promise<U | undefined> {
    return undefined;
  }
}

//#endregion

//#region React (Component-Level) Store Creator

/**
 * Object providing an FC holding a store and hooks for children to access it
 */
type ComponentStore<T, U> = {
  /** Function component that provides children with access to the store. */
  Provider: FC<{ onRerender?: (state: T) => U; children?: ReactNode }>;
  /**
   * Hook allowing children wrapped by Provider to subscribe to a slice of
   * state from the store
   */
  useSelector: <V>(selector: (state: T) => V) => V;
  /**
   * Hook allowing children wrapped by Provider dispatch state updates to the
   * store
   */
  useDispatch: () => (action: U) => void;
};

/**
 * NOTE: This function is not meant to be used directly. Extend
 * `ComponentStoreHelper` using an anonymous class instead!
 *
 * Creates a store and provides a React context and hooks for using it.
 */
export function createComponentStore<T, U>(
  createStore: () => Store<T, U>
): ComponentStore<T, U> {
  const Context = createContext<Store<T, U> | undefined>(undefined);

  /**
   * Provides children wrapped by it with access to the store via useContext.
   * @param props.onRerender Returns an action to be dispatched to the store
   * after every render. Useful for syncing the store with external state.
   * @param props.children Components which need access to the store.
   * @example Usage in a component:
   * // From body of component:
   * <Provider onRerender={(state) => ({ type: 'SYNC', state })}>
   *   <MyComponent />
   *   <MyOtherComponent />
   *   <MyLastComponent />
   * </Provider>
   */
  const Provider: ComponentStore<T, U>['Provider'] = (props) => {
    const storeRef = useRef<Store<T, U>>();
    if (!storeRef.current) {
      storeRef.current = createStore();
    }

    // This SHOULD happen after every render.
    // That is why there is no dependency array.
    useEffect(() => {
      if (!storeRef.current) {
        throw new Error('storeRef.current is undefined');
      }
      const nextMsg = props.onRerender?.(storeRef.current.getModel());
      if (nextMsg) {
        storeRef.current.dispatch(nextMsg);
      }
    });

    return createElement(
      Context.Provider,
      { value: storeRef.current },
      props.children
    );
  };

  /**
   * Returns a value from the store's state, subscribing to its changes.
   * @param selector Callback to select a single value from the store's state.
   * @example Usage in a component:
   * // From body of component wrapped by `Provider`:
   * const myValue = useSelector((state) => state.myValue);
   */
  const useSelector: ComponentStore<T, U>['useSelector'] = (selector) => {
    const store = useContext(Context);
    if (!store) {
      throw new Error('ComponentStore.Provider not found');
    }
    return useSyncExternalStore(store.subscribeToStateChanges, () =>
      selector(store.getModel())
    );
  };

  /**
   * Returns a function that allows dispatching actions to the component store
   * from within a component wrapped by the `Provider`.
   * @example Usage in a component:
   * // From body of component wrapped by `Provider`:
   * const dispatch = useDispatch();
   * // Later, in the same component:
   * <button onClick={() => dispatch({ type: 'INCREMENT' })}>Increment</button>
   */
  const useDispatch: ComponentStore<T, U>['useDispatch'] = () => {
    const store = useContext(Context);
    if (!store) {
      throw new Error('ComponentStore.Provider not found');
    }
    return store.dispatch;
  };

  return { Provider, useDispatch, useSelector };
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
 *
 * @example
 * type State = { count: number };
 *
 * type Action =
 *   | { type: 'INCREMENT' }
 *   | { type: 'DECREMENT' }
 *   | { type: 'INCREMENT_BY'; payload: number };
 *
 * const { Provider, useSelector, useDispatch } =
 *   new (class extends ComponentStoreHelper<State, Action> {
 *     override provideDefaultState(): State {
 *       return { count: 0 };
 *     }
 *
 *     override produceNextState(state: State, action: Action): State {
 *       switch (action.type) {
 *         case 'INCREMENT':
 *           return { ...state, count: state.count + 1 };
 *         case 'DECREMENT':
 *           return { ...state, count: state.count - 1 };
 *         case 'INCREMENT_BY':
 *           return { ...state, count: state.count + action.payload };
 *       }
 *     }
 *   })();
 */
export abstract class ComponentStoreHelper<T, U> {
  Provider: ComponentStore<T, U>['Provider'];
  useSelector: ComponentStore<T, U>['useSelector'];
  useDispatch: ComponentStore<T, U>['useDispatch'];

  protected constructor() {
    const store = createComponentStore(() => {
      return new Store(
        [this.provideDefaultState(), this.runInitialEffect],
        this.produceNextState,
        this.runEffectAndProduceNextAction
      );
    });
    this.Provider = store.Provider;
    this.useSelector = store.useSelector;
    this.useDispatch = store.useDispatch;
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
   * @param state Initial state of the store.
   */
  async runInitialEffect(state: T): Promise<U | undefined> {
    return undefined;
  }

  /**
   * Determines side effects to run when actions are dispatched to the store,
   * returning either another action to be dispatched to the store or nothing.
   *
   * Overriding this method is optional.
   * @param state Current state of the store.
   * @param action Message dispatched to the store.
   */
  async runEffectAndProduceNextAction(
    state: T,
    action: U
  ): Promise<U | undefined> {
    return undefined;
  }
}

//#endregion
