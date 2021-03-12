import { render } from "preact";
import "./index.css";
import { Foo } from "./Foo";
import { ReactComponent } from "./Compat";

function App() {
	return (
		<div>
			<h1>Hello from Preact</h1>
			<Foo />
			<h2>Compat</h2>
			<ReactComponent />
		</div>
	);
}

render(<App />, document.getElementById("app")!);
