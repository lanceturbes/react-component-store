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
    h("span", null, model),
    h("button", { onClick: () => dispatch({ type: "Increment" }) }, "+")
  );
}

type CounterModel = number;

type CounterMsg =
  | { type: "Increment" }
  | { type: "Decrement" }
  | { type: "Sync"; payload: number };

const { Provider, useDispatch, useSelector } =
  new (class extends ComponentStoreHelper<CounterModel, CounterMsg> {
    provideInitialModel(): CounterModel {
      return 0;
    }

    provideInitialCmd(): InitialCmd<CounterModel, CounterMsg> | undefined {
      return undefined;
    }

    produceNewModel(model: CounterModel, msg: CounterMsg): CounterModel {
      switch (msg.type) {
        case "Increment":
          return model + 1;
        case "Decrement":
          return model - 1;
        case "Sync":
          return msg.payload;
      }
    }

    produceNextMsg(
      model: CounterModel,
      msg: CounterMsg
    ): CounterMsg | undefined {
      return undefined;
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
      {
        onPropsChange: (dispatch) => dispatch({ type: "Sync", payload: count }),
      },
      h(MyCounter)
    )
  );
}

createRoot(document.getElementById("app")!).render(h(App));
