import React, { useEffect } from "react";

export type Listener = () => void;

export type Unsubscribe = () => void;

export type InitialCmd<T, U> = (model: T) => U | undefined;

export type Cmd<T, U> = (model: T, msg: U) => U | undefined;

export class Store<T, U> {
  private model: T;
  private listeners: Set<Listener> = new Set();

  constructor(
    init: [T, InitialCmd<T, U>?],
    private produceNewModel: (model: T, msg: U) => T,
    private produceNextMsg: Cmd<T, U> = () => undefined,
    private subscriptions: ((model: T) => void)[] = []
  ) {
    const [initialModel, initialCmd] = init;
    this.model = initialModel;
    if (!initialCmd) {
      return;
    }
    const initialMsg = initialCmd(initialModel);
    this.registerSubscriptions();
    if (initialMsg) {
      this.dispatch(initialMsg);
    }
  }

  getModel(): T {
    return this.model;
  }

  dispatch(msg: U): void {
    const newModel = this.produceNewModel(this.model, msg);
    this.model = newModel;
    const nextMsg = this.produceNextMsg(newModel, msg);
    if (nextMsg) {
      this.dispatch(nextMsg);
    }
    this.notify();
  }

  subscribeTo(subscription: (model: T) => void) {
    this.subscriptions.push(subscription);
    subscription(this.getModel());
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

  private registerSubscriptions(): void {
    this.subscriptions.forEach((subscription) => {
      this.addListener(() => {
        subscription(this.getModel());
      });
    });
  }
}

export class ComponentStore<T, U> {
  private Context = React.createContext<Store<T, U> | undefined>(undefined);
  constructor(private createStore: () => Store<T, U>) {}

  Provider({
    onPropsChange,
    children,
  }: {
    onPropsChange: (model: T) => U | undefined;
    children?: React.ReactNode;
  }) {
    const storeRef = React.useRef<Store<T, U>>();
    if (!storeRef.current) {
      storeRef.current = this.createStore();
      storeRef.current.subscribeTo(onPropsChange);
    }

    // This SHOULD happen after every render.
    // That is why there is no dependency array.
    useEffect(() => {
      const nextMsg = onPropsChange(storeRef.current!!.getModel());
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
      [this.provideInitialModel(), this.provideInitialCmd()],
      this.produceNewModel,
      this.produceNextMsg
    );
  }

  abstract provideInitialModel(): T;
  abstract provideInitialCmd(): InitialCmd<T, U> | undefined;
  abstract produceNewModel(model: T, msg: U): T;
  abstract produceNextMsg(model: T, msg: U): U | undefined;
}

export abstract class ComponentStoreHelper<T, U> {
  Provider: ComponentStore<T, U>["Provider"];
  useSelector: ComponentStore<T, U>["useSelector"];
  useDispatch: ComponentStore<T, U>["useDispatch"];

  constructor() {
    const store = new ComponentStore(() => {
      return new Store(
        [this.provideInitialModel(), this.provideInitialCmd()],
        this.produceNewModel,
        this.produceNextMsg
      );
    });
    this.Provider = store.Provider.bind(store);
    this.useSelector = store.useSelector.bind(store);
    this.useDispatch = store.useDispatch.bind(store);
  }

  abstract provideInitialModel(): T;
  abstract provideInitialCmd(): InitialCmd<T, U> | undefined;
  abstract produceNewModel(model: T, msg: U): T;
  abstract produceNextMsg(model: T, msg: U): U | undefined;
}
