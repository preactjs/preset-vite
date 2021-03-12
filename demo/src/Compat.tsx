// @ts-ignore
import React, { useState } from "react";

export function ReactComponent() {
	const [v, set] = useState(0);

	return (
		<div>
			<p>Counter: {v}</p>
			<button onClick={() => set(v + 1)}>update</button>
		</div>
	);
}
