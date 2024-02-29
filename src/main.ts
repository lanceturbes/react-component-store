import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { ComponentStoreHelper } from "./lib";

createRoot(document.getElementById("app")!).render(h(App));

function App() {
  const [count, setCount] = useState(0);

  return h(
    "div",
    null,
    h(
      "button",
      { onClick: () => setCount(count + 1) },
      "Override From Outside",
    ),
    h(
      Provider,
      { onRerender: () => ({ type: "Sync", payload: count }) as const },
      h(MyCounter),
    ),
    h(
      Provider,
      { onRerender: () => ({ type: "Sync", payload: count }) as const },
      h(MyCounter),
    ),
  );
}

function MyCounter() {
  const dispatch = useDispatch();
  const model = useSelector((model) => model);

  return h(
    "div",
    null,
    h("button", { onClick: () => dispatch({ type: "Decrement" }) }, "-"),
    h("span", null, model.count),
    h("button", { onClick: () => dispatch({ type: "Increment" }) }, "+"),
  );
}

type CounterState = { count: number };

type CounterAction =
  | { type: "Increment" }
  | { type: "Decrement" }
  | { type: "Sync"; payload: number };

const { Provider, useDispatch, useSelector } =
  new (class extends ComponentStoreHelper<CounterState, CounterAction> {
    override provideDefaultState(): CounterState {
      return { count: 0 };
    }

    override produceNextState(
      model: CounterState,
      msg: CounterAction,
    ): CounterState {
      switch (msg.type) {
        case "Increment":
          return { count: model.count + 1 };
        case "Decrement":
          return { count: model.count - 1 };
        case "Sync":
          return { count: msg.payload };
      }
    }

    override async runInitialEffect(
      model: CounterState,
    ): Promise<CounterAction> {
      return { type: "Sync", payload: model.count };
    }
  })();
