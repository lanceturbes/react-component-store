import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { ComponentStoreHelper, InitialCmd } from "./lib";

function MyCounter() {
  const dispatch = useDispatch();
  const model = useSelector((model) => model);

  return h(
    "div",
    null,
    h("button", { onClick: () => dispatch({ type: "Decrement" }) }, "-"),
    h("span", null, model.count),
    h("button", { onClick: () => dispatch({ type: "Increment" }) }, "+")
  );
}

type CounterModel = {
  count: number;
};

type CounterMsg =
  | { type: "Increment" }
  | { type: "Decrement" }
  | { type: "Sync"; payload: number };

const { Provider, useDispatch, useSelector } =
  new (class extends ComponentStoreHelper<CounterModel, CounterMsg> {
    provideInitialModel(): CounterModel {
      return { count: 0 };
    }

    async provideInitialCmd(
      _model: CounterModel
    ): Promise<CounterMsg | undefined> {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { type: "Decrement" };
    }

    produceNewModel(model: CounterModel, msg: CounterMsg): CounterModel {
      switch (msg.type) {
        case "Increment":
          return { ...model, count: model.count + 1 };
        case "Decrement":
          return { ...model, count: model.count - 1 };
        case "Sync":
          return { ...model, count: msg.payload };
      }
    }

    async produceNextMsg(
      model: CounterModel,
      msg: CounterMsg
    ): Promise<CounterMsg | undefined> {
      switch (msg.type) {
        case "Increment": {
          if (model.count === 5) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return { type: "Increment" };
          }
          return undefined;
        }
        default:
          return undefined;
      }
    }
  })();

function App() {
  const [count, setCount] = useState(0);

  return h(
    "div",
    null,
    h(
      "button",
      { onClick: () => setCount(count + 1) },
      "Override From Outside"
    ),
    h(
      Provider,
      { onRerender: () => ({ type: "Sync", payload: count } as const) },
      h(MyCounter)
    ),
    h(
      Provider,
      { onRerender: () => ({ type: "Sync", payload: count } as const) },
      h(MyCounter)
    )
  );
}

createRoot(document.getElementById("app")!).render(h(App));
