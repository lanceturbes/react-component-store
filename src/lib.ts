import React, { useEffect } from "react";

export type Listener = () => void;

export type Unsubscribe = () => void;

export type InitialCmd<T, U> = (model: T) => Promise<U | undefined>;

export type Cmd<T, U> = (model: T, msg: U) => Promise<U | undefined>;

export class Store<T, U> {
  private model: T;
  private listeners: Set<Listener> = new Set();

  constructor(
    init: [T, InitialCmd<T, U>?],
    private produceNewModel: (model: T, msg: U) => T,
    private produceNextMsg: Cmd<T, U> = async () => undefined
  ) {
    const [initialModel, initialCmd] = init;
    this.model = initialModel;
    if (!initialCmd) {
      return;
    }
    initialCmd(initialModel)
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
    return this.model;
  }

  dispatch(msg: U): void {
    const newModel = this.produceNewModel(this.model, msg);
    this.model = newModel;
    this.produceNextMsg(newModel, msg)
      .then((nextMsg) => {
        if (nextMsg) {
          this.dispatch(nextMsg);
        }
      })
      .catch((e) => {
        console.error(e);
      });
    this.notify();
  }

  addListener(listener: Listener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export class ComponentStore<T, U> {
  private Context = React.createContext<Store<T, U> | undefined>(undefined);
  constructor(private createStore: () => Store<T, U>) {}

  Provider({
    onRerender,
    children,
  }: {
    onRerender: (model: T) => U;
    children?: React.ReactNode;
  }) {
    const storeRef = React.useRef<Store<T, U>>();
    if (!storeRef.current) {
      storeRef.current = this.createStore();
    }

    // This SHOULD happen after every render.
    // That is why there is no dependency array.
    useEffect(() => {
      const nextMsg = onRerender(storeRef.current!!.getModel());
      if (nextMsg) {
        storeRef.current!!.dispatch(nextMsg);
      }
    });

    return React.createElement(
      this.Context.Provider,
      { value: storeRef.current },
      children
    );
  }

  useSelector<V>(selector: (model: T) => V): V {
    const store = React.useContext(this.Context);
    if (!store) {
      throw new Error("ComponentStore.Provider not found");
    }
    return React.useSyncExternalStore(store.addListener.bind(store), () =>
      selector(store.getModel())
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

export abstract class StoreHelper<T, U> {
  store: Store<T, U>;

  constructor() {
    this.store = new Store(
      [this.provideInitialModel(), this.provideInitialCmd],
      this.produceNewModel,
      this.produceNextMsg
    );
  }

  abstract provideInitialModel(): T;
  abstract provideInitialCmd(model: T): Promise<U | undefined>;
  abstract produceNewModel(model: T, msg: U): T;
  abstract produceNextMsg(model: T, msg: U): Promise<U | undefined>;
}

export abstract class ComponentStoreHelper<T, U> {
  Provider: ComponentStore<T, U>["Provider"];
  useSelector: ComponentStore<T, U>["useSelector"];
  useDispatch: ComponentStore<T, U>["useDispatch"];

  constructor() {
    const store = new ComponentStore(() => {
      return new Store(
        [this.provideInitialModel(), this.provideInitialCmd],
        this.produceNewModel,
        this.produceNextMsg
      );
    });
    this.Provider = store.Provider.bind(store);
    this.useSelector = store.useSelector.bind(store);
    this.useDispatch = store.useDispatch.bind(store);
  }

  abstract provideInitialModel(): T;
  abstract provideInitialCmd(model: T): Promise<U | undefined>;
  abstract produceNewModel(model: T, msg: U): T;
  abstract produceNextMsg(model: T, msg: U): Promise<U | undefined>;
}
